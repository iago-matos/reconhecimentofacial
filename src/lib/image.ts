/** Utilitários de imagem: validação de arquivo, redimensionamento e recorte do rosto. */

export const MAX_FILE_BYTES = 15 * 1024 * 1024;
/** Lado maior da imagem analisada (aparelhos de ponta aguentam; rostos pequenos ganham detalhe). */
export const MAX_ANALYSIS_SIDE = 2560;

const ACCEPTED = new Set(["image/jpeg", "image/png", "image/webp"]);

export function validateImageFile(file: File): string | null {
  const okType = ACCEPTED.has(file.type.toLowerCase()) || /\.(jpe?g|png|webp)$/i.test(file.name);
  if (!okType) return "Formato inválido. Use JPG, PNG ou WEBP.";
  if (file.size > MAX_FILE_BYTES) return "Imagem muito grande (máximo 15 MB).";
  return null;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Não foi possível abrir a imagem."));
    img.src = src;
  });
}

/** Desenha a origem num canvas, reduzindo para no máximo `maxSide` pixels no lado maior. */
export function toCanvas(
  source: CanvasImageSource,
  width: number,
  height: number,
  maxSide = MAX_ANALYSIS_SIDE,
): HTMLCanvasElement {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível neste navegador.");
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export async function fileToCanvas(file: File, maxSide = MAX_ANALYSIS_SIDE): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    return toCanvas(img, img.naturalWidth, img.naturalHeight, maxSide);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function videoToCanvas(video: HTMLVideoElement): HTMLCanvasElement {
  if (!video.videoWidth) throw new Error("A câmera ainda não está pronta.");
  return toCanvas(video, video.videoWidth, video.videoHeight);
}

export async function fileToDataUrl(file: File, maxSide = 800): Promise<string> {
  return (await fileToCanvas(file, maxSide)).toDataURL("image/jpeg", 0.85);
}

export type Box = [x: number, y: number, width: number, height: number];

/** Recorta o rosto com uma margem em volta e devolve um JPEG pequeno. */
export function cropFace(source: HTMLCanvasElement, box: Box, margin = 0.45, maxSide = 400): string {
  const [x, y, w, h] = box;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const side = Math.max(w, h) * (1 + margin * 2);
  const sx = Math.max(0, cx - side / 2);
  const sy = Math.max(0, cy - side / 2);
  const sw = Math.min(source.width - sx, side);
  const sh = Math.min(source.height - sy, side);
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(sw * scale));
  out.height = Math.max(1, Math.round(sh * scale));
  out.getContext("2d")?.drawImage(source, sx, sy, sw, sh, 0, 0, out.width, out.height);
  return out.toDataURL("image/jpeg", 0.85);
}
