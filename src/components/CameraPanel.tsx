import { useEffect, useRef, useState } from "react";
import { Camera, ImageUp, SwitchCamera } from "lucide-react";
import { Button, Notice } from "@/components/ui";
import { fileToCanvas, validateImageFile, videoToCanvas } from "@/lib/image";

interface Props {
  onImage: (canvas: HTMLCanvasElement) => void;
  disabled?: boolean;
}

type Facing = "environment" | "user";

/** Câmera (traseira por padrão, como em uma abordagem) e envio de foto do aparelho. */
export default function CameraPanel({ onImage, disabled }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [facing, setFacing] = useState<Facing>("environment");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [nonce, setNonce] = useState(0);

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

  const capture = () => {
    if (!videoRef.current) return;
    try {
      onImage(videoToCanvas(videoRef.current));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const problem = validateImageFile(file);
    if (problem) return setError(problem);
    try {
      onImage(await fileToCanvas(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="space-y-3">
      <div className="relative mx-auto aspect-[3/4] max-h-[60svh] w-full overflow-hidden rounded-lg border-2 border-primary/50 bg-muted sm:aspect-[4/3]">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`h-full w-full object-cover ${facing === "user" ? "-scale-x-100" : ""}`}
        />
        <div className="pointer-events-none absolute inset-[12%] rounded-[40%] border-2 border-dashed border-primary/40" />
        {!ready && !error && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">Abrindo câmera…</p>
        )}
      </div>

      {error && (
        <Notice tone="warn">
          {error}{" "}
          <button className="underline" onClick={() => setNonce((n) => n + 1)}>
            Tentar de novo
          </button>
        </Notice>
      )}

      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Button variant="primary" onClick={capture} disabled={!ready || disabled} className="text-base">
          <Camera className="h-5 w-5" /> Capturar
        </Button>
        <Button
          onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
          disabled={disabled}
          title={facing === "environment" ? "Usar câmera frontal" : "Usar câmera traseira"}
          aria-label="Trocar câmera"
        >
          <SwitchCamera className="h-5 w-5" />
        </Button>
      </div>
      <Button className="w-full" onClick={() => fileRef.current?.click()} disabled={disabled}>
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
