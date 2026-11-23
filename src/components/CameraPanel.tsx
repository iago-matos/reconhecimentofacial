import { useEffect, useRef, useState } from "react";
import { Camera, ImageUp, ScanEye, SwitchCamera } from "lucide-react";
import { Button, Notice } from "@/components/ui";
import { fileToCanvas, validateImageFile, videoToCanvas } from "@/lib/image";
import { livenessSample } from "@/lib/recognition/engine";
import { LIVENESS, analyzeLiveness, type LiveSample, type LivenessStatus } from "@/lib/recognition/liveness";

interface Props {
  /** `liveness` diz se a captura comprovou que a pessoa estava presente. */
  onImage: (canvas: HTMLCanvasElement, liveness: LivenessStatus) => void;
  disabled?: boolean;
}

/** Estado do desafio de prova de vida. */
type Challenge = { phase: "idle" } | { phase: "running"; elapsed: number; tracked: boolean } | { phase: "failed" };

type Facing = "environment" | "user";

/** Câmera (traseira por padrão, como em uma abordagem) e envio de foto do aparelho. */
export default function CameraPanel({ onImage, disabled }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [facing, setFacing] = useState<Facing>("environment");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [nonce, setNonce] = useState(0);
  const [challenge, setChallenge] = useState<Challenge>({ phase: "idle" });
  const cancelChallenge = useRef(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    setReady(false);
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Este navegador não permite usar a câmera. Use \"Enviar foto\".");
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 2560 }, height: { ideal: 1920 } }, audio: false })
      .then((s) => {
        // Se a tela fechou enquanto a câmera abria, desliga na hora.
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        const video = videoRef.current;
        if (video) {
          video.srcObject = s;
          video.onloadedmetadata = () => setReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Sem acesso à câmera. Verifique a permissão do navegador ou use \"Enviar foto\".");
      });
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [facing, nonce]);

  const capture = (liveness: LivenessStatus = { kind: "nao_verificada" }) => {
    if (!videoRef.current) return;
    try {
      onImage(videoToCanvas(videoRef.current), liveness);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  // Desliga o desafio se a câmera fechar ou o componente sair da tela.
  useEffect(() => {
    cancelChallenge.current = false;
    return () => {
      cancelChallenge.current = true;
    };
  }, [facing, nonce]);

  /**
   * Prova de vida ativa: acompanha o rosto por até 6 s; ao detectar uma piscada completa
   * ou um giro de cabeça, captura na hora (olho já reaberto).
   */
  const captureWithLiveness = async () => {
    const video = videoRef.current;
    if (!video) return;
    cancelChallenge.current = false;
    const samples: LiveSample[] = [];
    const t0 = performance.now();
    setChallenge({ phase: "running", elapsed: 0, tracked: false });
    while (!cancelChallenge.current) {
      const elapsed = performance.now() - t0;
      if (elapsed > LIVENESS.timeoutMs) break;
      const s = await livenessSample(video).catch(() => null);
      if (s) samples.push({ t: elapsed, ...s });
      setChallenge({ phase: "running", elapsed, tracked: !!s });
      const r = analyzeLiveness(samples);
      if (r.passed && r.method) {
        setChallenge({ phase: "idle" });
        capture({ kind: "comprovada", method: r.method });
        return;
      }
    }
    if (!cancelChallenge.current) setChallenge({ phase: "failed" });
  };

  const running = challenge.phase === "running";

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const problem = validateImageFile(file);
    if (problem) return setError(problem);
    try {
      onImage(await fileToCanvas(file), { kind: "arquivo" });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="space-y-3">
      <div className="relative mx-auto aspect-[3/4] max-h-[46svh] w-full overflow-hidden rounded-xl border border-border bg-muted sm:aspect-[4/3]">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`h-full w-full object-cover ${facing === "user" ? "-scale-x-100" : ""}`}
        />
        <div className="pointer-events-none absolute inset-[12%] rounded-[40%] border-2 border-dashed border-foreground/50" />
        {!ready && !error && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">Abrindo câmera…</p>
        )}
        {challenge.phase === "running" && (
          <div className="absolute inset-x-0 bottom-0 space-y-1.5 bg-background/85 p-3" role="status">
            <p className="font-heading text-lg leading-tight">Peça para a pessoa piscar devagar ou virar o rosto para o lado</p>
            <p className="text-xs text-muted-foreground">{challenge.tracked ? "Acompanhando o rosto…" : "Procurando o rosto…"}</p>
            <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
              <div className="h-full bg-foreground" style={{ width: `${Math.min(100, (challenge.elapsed / LIVENESS.timeoutMs) * 100)}%` }} />
            </div>
          </div>
        )}
      </div>

      {challenge.phase === "failed" && (
        <Notice tone="warn">
          Não foi possível comprovar a prova de vida: a pessoa não piscou nem virou o rosto. Pode ser uma foto de foto ou de tela.
          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="secondary" className="min-h-10 py-1" onClick={() => void captureWithLiveness()}>
              Tentar de novo
            </Button>
            <Button
              variant="ghost"
              className="min-h-10 py-1"
              onClick={() => {
                setChallenge({ phase: "idle" });
                capture({ kind: "nao_comprovada" });
              }}
            >
              Usar mesmo assim
            </Button>
          </div>
        </Notice>
      )}

      {error && (
        <Notice tone="warn">
          {error}{" "}
          <button className="underline" onClick={() => setNonce((n) => n + 1)}>
            Tentar de novo
          </button>
        </Notice>
      )}

      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Button variant="primary" onClick={() => capture()} disabled={!ready || disabled || running} className="text-base">
          <Camera className="h-5 w-5" /> Capturar
        </Button>
        <Button
          onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
          disabled={disabled || running}
          title={facing === "environment" ? "Usar câmera frontal" : "Usar câmera traseira"}
          aria-label="Trocar câmera"
        >
          <SwitchCamera className="h-5 w-5" />
        </Button>
      </div>
      <Button className="w-full" onClick={() => void captureWithLiveness()} disabled={!ready || disabled || running}>
        <ScanEye className="h-5 w-5" /> Capturar com prova de vida
      </Button>
      <Button className="w-full" onClick={() => fileRef.current?.click()} disabled={disabled || running}>
        <ImageUp className="h-5 w-5" /> Enviar foto do aparelho
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => void onFile(e)}
      />
    </div>
  );
}
