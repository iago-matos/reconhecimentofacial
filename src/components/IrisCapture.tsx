import { useEffect, useRef, useState } from "react";
import { Camera, Flashlight, RotateCcw, SwitchCamera, ZoomIn } from "lucide-react";
import { Button, Card, Notice, Spinner } from "@/components/ui";
import { analyzeIrisPhoto, quickIrisEstimate, type IrisCaptureResult } from "@/lib/recognition/engine";
import { ISO_AUTH_DIAMETER, ISO_ENROL_DIAMETER, MIN_DIAMETER, type QualityGrade } from "@/lib/iris/pipeline";
import { EYE_LABEL } from "@/lib/types";

interface Props {
  /** Título da tela (ex.: "Cadastrar íris de Fulano"). */
  title: string;
  onResult: (r: IrisCaptureResult) => void;
  onCancel?: () => void;
}

type Facing = "environment" | "user";

/** Recursos de câmera que nem todo navegador expõe (Chrome Android expõe). */
interface ExtCapabilities extends MediaTrackCapabilities {
  torch?: boolean;
  zoom?: { min: number; max: number; step: number };
  focusMode?: string[];
}

interface ImageCaptureLike {
  takePhoto(settings?: { imageWidth?: number; imageHeight?: number }): Promise<Blob>;
  getPhotoCapabilities?(): Promise<{ imageWidth?: { max: number }; imageHeight?: { max: number } }>;
}
declare global {
  interface Window {
    ImageCapture?: new (track: MediaStreamTrack) => ImageCaptureLike;
  }
}

const GRADE_TONE: Record<QualityGrade, "ok" | "warn" | "error"> = { boa: "ok", aceitavel: "warn", ruim: "error" };
const GRADE_TEXT: Record<QualityGrade, string> = { boa: "boa", aceitavel: "aceitável", ruim: "ruim" };

/**
 * Captura de íris em luz visível (Etapa 3).
 * Câmera traseira na maior resolução do aparelho; o rosto deve ocupar a moldura.
 * Enquanto a câmera está aberta, mede o tamanho da íris e orienta a aproximação.
 */
export default function IrisCapture({ title, onResult, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  /** Leitura ao vivo em andamento: a captura espera por ela (o motor não deve rodar duas análises ao mesmo tempo). */
  const pendingRef = useRef<Promise<unknown> | null>(null);
  const [facing, setFacing] = useState<Facing>("environment");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [caps, setCaps] = useState<ExtCapabilities | null>(null);
  const [torch, setTorch] = useState(false);
  const [zoom, setZoom] = useState<number | null>(null);
  const [photoWidth, setPhotoWidth] = useState(0);
  const [live, setLive] = useState<{ diameterPx: number; eyesOpen: boolean; centered: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    setReady(false);
    setError("");
    setLive(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Este navegador não permite usar a câmera.");
      return;
    }
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: { ideal: facing }, width: { ideal: 4096 }, height: { ideal: 3072 } },
        audio: false,
      })
      .then(async (s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        const track = s.getVideoTracks()[0];
        trackRef.current = track;
        const c = (track.getCapabilities?.() ?? {}) as ExtCapabilities;
        setCaps(c);
        if (c.focusMode?.includes("continuous")) {
          await track.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] }).catch(() => undefined);
        }
        setZoom(c.zoom ? c.zoom.min : null);
        let width = track.getSettings().width ?? 0;
        if (window.ImageCapture) {
          const pc = await new window.ImageCapture(track).getPhotoCapabilities?.().catch(() => undefined);
          if (pc?.imageWidth?.max) width = Math.max(width, pc.imageWidth.max);
        }
        setPhotoWidth(width);
        const video = videoRef.current;
        if (video) {
          video.srcObject = s;
          video.onloadedmetadata = () => setReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Sem acesso à câmera. Verifique a permissão do navegador.");
      });
    return () => {
      cancelled = true;
      trackRef.current = null;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [facing, nonce]);

  // Orientação ao vivo (a cada ~0,8 s).
  useEffect(() => {
    if (!ready || busy) return;
    let stop = false;
    const tick = async () => {
      while (!stop) {
        const v = videoRef.current;
        if (v && v.videoWidth) {
          const job = quickIrisEstimate(v, photoWidth || v.videoWidth).catch(() => null);
          pendingRef.current = job;
          const est = await job;
          pendingRef.current = null;
          if (!stop) setLive(est);
        }
        await new Promise((r) => setTimeout(r, 800));
      }
    };
    void tick();
    return () => {
      stop = true;
    };
  }, [ready, busy, photoWidth]);

  const setTorchOn = async (on: boolean) => {
    const t = trackRef.current;
    if (!t) return;
    await t.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] }).catch(() => setError("Lanterna indisponível."));
    setTorch(on);
  };

  const setZoomValue = async (z: number) => {
    const t = trackRef.current;
    if (!t) return;
    setZoom(z);
    await t.applyConstraints({ advanced: [{ zoom: z } as MediaTrackConstraintSet] }).catch(() => undefined);
  };

  const grabFrame = async (): Promise<HTMLCanvasElement> => {
    const track = trackRef.current;
    const video = videoRef.current;
    if (!track || !video) throw new Error("A câmera ainda não está pronta.");
    // Foto em resolução total do sensor quando o navegador permite (ImageCapture); senão, quadro do vídeo.
    if (window.ImageCapture) {
      try {
        const blob = await new window.ImageCapture(track).takePhoto();
        const bmp = await createImageBitmap(blob);
        const c = document.createElement("canvas");
        c.width = bmp.width;
        c.height = bmp.height;
        c.getContext("2d")!.drawImage(bmp, 0, 0);
        bmp.close();
        return c;
      } catch {
        /* cai para o quadro do vídeo */
      }
    }
    const c = document.createElement("canvas");
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    c.getContext("2d")!.drawImage(video, 0, 0);
    return c;
  };

  const capture = async () => {
    setBusy(true);
    setError("");
    try {
      await pendingRef.current;
      const canvas = await grabFrame();
      const result = await analyzeIrisPhoto(canvas);
      if (!result.face) {
        setError("Nenhum rosto encontrado. Enquadre o rosto inteiro na moldura, bem de perto.");
        return;
      }
      onResult(result);
    } catch (e) {
      setError(`Falha na captura: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const d = live?.diameterPx ?? 0;
  const sizeMsg = !live
    ? "Procurando o rosto…"
    : d < MIN_DIAMETER
      ? `Íris ≈ ${Math.round(d)} px — aproxime mais`
      : d < ISO_AUTH_DIAMETER
        ? `Íris ≈ ${Math.round(d)} px — aceitável, aproxime um pouco`
        : d < ISO_ENROL_DIAMETER
          ? `Íris ≈ ${Math.round(d)} px — bom`
          : `Íris ≈ ${Math.round(d)} px — ótimo`;
  // Indicadores de captura usam a escala neutra (o verde fica reservado ao que o policial confirma).
  const sizeTone =
    !live || d < MIN_DIAMETER ? "bg-destructive text-destructive-foreground" : d < ISO_AUTH_DIAMETER ? "bg-accent text-accent-foreground" : "bg-foreground text-background";

  return (
    <div className="space-y-3">
      <h2 className="text-lg">{title}</h2>
      <Notice tone="info">
        Câmera traseira, <b>bem de perto</b>: o rosto deve encher a moldura. Luz forte e de frente (lanterna ajuda), sem
        janela refletindo no olho. Peça para <b>abrir bem os olhos</b> e olhar para a câmera.
      </Notice>

      <div className="relative mx-auto aspect-[3/4] max-h-[46svh] w-full overflow-hidden rounded-xl border border-border bg-muted">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`h-full w-full object-cover ${facing === "user" ? "-scale-x-100" : ""}`}
        />
        <div className="pointer-events-none absolute inset-x-[6%] inset-y-[8%] rounded-[45%] border-2 border-dashed border-foreground/50" />
        <div className="pointer-events-none absolute inset-x-[18%] top-[36%] flex justify-between">
          <span className="h-8 w-8 rounded-full border-2 border-foreground/60" />
          <span className="h-8 w-8 rounded-full border-2 border-foreground/60" />
        </div>
        {ready && (
          <div className="absolute inset-x-2 top-2 flex flex-wrap justify-center gap-1 text-xs font-semibold">
            <span className={`rounded-md px-2 py-1 ${sizeTone}`}>{sizeMsg}</span>
            {live && !live.eyesOpen && <span className="rounded bg-accent/90 px-2 py-1 text-accent-foreground">Olhos pouco abertos</span>}
            {live && !live.centered && <span className="rounded bg-accent/90 px-2 py-1 text-accent-foreground">Centralize o rosto</span>}
          </div>
        )}
        {!ready && !error && <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">Abrindo câmera…</p>}
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <Spinner label="Analisando íris…" />
          </div>
        )}
      </div>

      {photoWidth > 0 && (
        <p className="text-center text-xs text-muted-foreground">
          Resolução da foto: {photoWidth} px de largura{photoWidth < 2500 ? " — aparelho com câmera de baixa resolução; a íris pode ficar pequena." : ""}
        </p>
      )}

      {caps?.zoom && zoom != null && (
        <label className="flex items-center gap-2 text-sm">
          <ZoomIn className="h-4 w-4" />
          <input
            type="range"
            min={caps.zoom.min}
            max={caps.zoom.max}
            step={caps.zoom.step || 0.1}
            value={zoom}
            onChange={(e) => void setZoomValue(Number(e.target.value))}
            className="flex-1"
            aria-label="Zoom"
          />
          <span className="w-10 text-right">{zoom.toFixed(1)}×</span>
        </label>
      )}

      {error && (
        <Notice tone="warn">
          {error}{" "}
          <button className="underline" onClick={() => setNonce((n) => n + 1)}>
            Reabrir câmera
          </button>
        </Notice>
      )}

      <div className="grid grid-cols-[1fr_auto_auto] gap-2">
        <Button variant="primary" onClick={() => void capture()} disabled={!ready || busy} className="text-base">
          <Camera className="h-5 w-5" /> Capturar íris
        </Button>
        <Button
          onClick={() => void setTorchOn(!torch)}
          disabled={!caps?.torch || busy}
          aria-pressed={torch}
          aria-label="Lanterna"
          title={caps?.torch ? "Lanterna" : "Lanterna indisponível neste aparelho"}
          className={torch ? "ring-2 ring-accent" : ""}
        >
          <Flashlight className="h-5 w-5" />
        </Button>
        <Button
          onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
          disabled={busy}
          aria-label="Trocar câmera"
          title="Trocar câmera"
        >
          <SwitchCamera className="h-5 w-5" />
        </Button>
      </div>
      {onCancel && (
        <Button variant="ghost" className="w-full" onClick={onCancel} disabled={busy}>
          Cancelar
        </Button>
      )}
    </div>
  );
}

/** Mostra o laudo de cada olho capturado; usado no cadastro e na conferência. */
export function IrisCaptureReport({
  result,
  selected,
  onToggle,
  onRetry,
}: {
  result: IrisCaptureResult;
  /** Olhos marcados para uso (cadastro). Sem isso, só exibe. */
  selected?: Record<string, boolean>;
  onToggle?: (side: string) => void;
  onRetry?: () => void;
}) {
  return (
    <div className="space-y-3">
      {result.eyes.map((e) => {
        const q = e.extraction?.quality;
        return (
          <Card key={e.side} className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base">{EYE_LABEL[e.side]}</h3>
              {q && (
                <span className={`rounded-md px-2 py-0.5 text-sm font-bold ${q.grade === "boa" ? "bg-foreground text-background" : q.grade === "aceitavel" ? "bg-accent text-accent-foreground" : "bg-destructive text-destructive-foreground"}`}>
                  Qualidade {GRADE_TEXT[q.grade]}
                </span>
              )}
            </div>
            {e.preview && (
              <figure className="space-y-1">
                <img src={e.preview} alt={`Recorte do ${EYE_LABEL[e.side].toLowerCase()}`} className="w-full rounded-md border border-border" />
                {e.extraction && (
                  <figcaption className="text-[11px] text-muted-foreground">
                    Círculo branco: borda da íris. Círculo interno: pupila ({e.extraction.quality.pupilEstimated ? "dourado, estimada" : "cáqui, encontrada"}).
                  </figcaption>
                )}
              </figure>
            )}
            {e.normalizedPreview && (
              <figure className="space-y-1">
                <img src={e.normalizedPreview} alt="Íris desenrolada" className="w-full rounded border border-border [image-rendering:pixelated]" style={{ aspectRatio: "8 / 1" }} />
                <figcaption className="text-[11px] text-muted-foreground">Íris desenrolada: a pupila fica em cima e a borda embaixo. Em vermelho, o que foi descartado (pálpebra, cílio, reflexo).</figcaption>
              </figure>
            )}
            {q && (
              <ul className="grid grid-cols-2 gap-x-3 text-xs text-muted-foreground">
                <li>Diâmetro: {Math.round(q.diameterPx)} px</li>
                <li>Área útil: {Math.round(q.usableArea * 100)}%</li>
                <li>Pupila/íris: {q.pupilRatio.toFixed(2).replace(".", ",")}</li>
                <li>Nitidez: {q.sharpness.toFixed(2).replace(".", ",")}</li>
              </ul>
            )}
            {q && q.reasons.length > 0 && (
              <Notice tone={GRADE_TONE[q.grade]}>
                <ul className="space-y-1">
                  {q.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </Notice>
            )}
            {e.error && <Notice tone="error">{e.error}</Notice>}
            {selected && onToggle && e.extraction && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!selected[e.side]} onChange={() => onToggle(e.side)} disabled={q?.grade === "ruim"} />
                {q?.grade === "ruim" ? "Qualidade ruim — não pode ser usada" : "Usar esta amostra"}
              </label>
            )}
          </Card>
        );
      })}
      {onRetry && (
        <Button className="w-full" onClick={onRetry}>
          <RotateCcw className="h-4 w-4" /> Capturar de novo
        </Button>
      )}
    </div>
  );
}
