import { estimateSimilarity, invertSimilarity, similarityScale, applySimilarity, type Pt, type Similarity } from "@/lib/recognition/geometry";

/**
 * Posição padrão dos 5 pontos num rosto de 112×112 usada no treino do ArcFace/InsightFace
 * (olho à esquerda da imagem, olho à direita, nariz, canto da boca à esquerda, à direita).
 */
export const ARCFACE_TEMPLATE: Pt[] = [
  [38.2946, 51.6963],
  [73.5318, 51.5014],
  [56.0252, 71.7366],
  [41.5493, 92.3655],
  [70.7299, 92.2041],
];
export const ARCFACE_SIZE = 112;

/** Alinha o rosto: transformação que leva os 5 pontos da foto para o gabarito do modelo. */
export function arcfaceTransform(points: Pt[]): Similarity {
  return estimateSimilarity(points, ARCFACE_TEMPLATE);
}

/** Lado do recorte alinhado guardado para a comparação visual (folha de comparação). */
export const COMPARE_SIZE = 240;
/** O recorte do modelo corta testa e queixo; para o olho humano o rosto ocupa 72% da moldura. */
const COMPARE_ZOOM = 0.72;
const zoomed = (v: number) => 0.5 + (v / ARCFACE_SIZE - 0.5) * COMPARE_ZOOM;
/** Altura relativa (0..1) da linha dos olhos e da boca no recorte de comparação. */
export const EYE_LINE = zoomed((ARCFACE_TEMPLATE[0][1] + ARCFACE_TEMPLATE[1][1]) / 2);
export const MOUTH_LINE = zoomed((ARCFACE_TEMPLATE[3][1] + ARCFACE_TEMPLATE[4][1]) / 2);

/**
 * Recorte para mostrar ao policial: mesmo alinhamento do modelo, com mais margem.
 * Duas fotos alinhadas assim ficam com olhos e boca na mesma altura, lado a lado.
 */
export function alignedPreview(source: HTMLCanvasElement, points: Pt[]): string {
  const dst = ARCFACE_TEMPLATE.map(([x, y]) => [zoomed(x) * COMPARE_SIZE, zoomed(y) * COMPARE_SIZE] as Pt);
  return warpSimilarity(source, estimateSimilarity(points, dst), COMPARE_SIZE, COMPARE_SIZE).toDataURL("image/jpeg", 0.86);
}

/**
 * Aplica a transformação (origem → saída) e devolve um canvas `outW × outH`.
 * Quando a redução é grande (rosto grande na foto), reduz antes com filtro de qualidade
 * para não serrilhar (o canvas não faz mipmapping ao desenhar com transformação).
 */
export function warpSimilarity(source: HTMLCanvasElement, t: Similarity, outW: number, outH: number): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível.");
  ctx.fillStyle = "rgb(128,128,128)";
  ctx.fillRect(0, 0, outW, outH);

  let src: HTMLCanvasElement = source;
  let tt = t;
  const s = similarityScale(t);
  if (s < 0.5) {
    // Região da origem que aparece na saída (+ margem).
    const inv = invertSimilarity(t);
    const corners = ([[0, 0], [outW, 0], [0, outH], [outW, outH]] as Pt[]).map((p) => applySimilarity(inv, p));
    const pad = 4 / s;
    const x0 = Math.max(0, Math.floor(Math.min(...corners.map((p) => p[0])) - pad));
    const y0 = Math.max(0, Math.floor(Math.min(...corners.map((p) => p[1])) - pad));
    const x1 = Math.min(source.width, Math.ceil(Math.max(...corners.map((p) => p[0])) + pad));
    const y1 = Math.min(source.height, Math.ceil(Math.max(...corners.map((p) => p[1])) + pad));
    if (x1 > x0 && y1 > y0) {
      const k = Math.min(1, s * 2);
      const mid = document.createElement("canvas");
      mid.width = Math.max(1, Math.round((x1 - x0) * k));
      mid.height = Math.max(1, Math.round((y1 - y0) * k));
      const mctx = mid.getContext("2d")!;
      mctx.imageSmoothingEnabled = true;
      mctx.imageSmoothingQuality = "high";
      mctx.drawImage(source, x0, y0, x1 - x0, y1 - y0, 0, 0, mid.width, mid.height);
      const kx = mid.width / (x1 - x0);
      // ponto do mid = (p − (x0,y0))·k  →  p = mid/k + (x0,y0)
      tt = { a: t.a / kx, b: t.b / kx, tx: t.tx + t.a * x0 - t.b * y0, ty: t.ty + t.b * x0 + t.a * y0 };
      src = mid;
    }
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  // canvas: x' = a·x + c·y + e ; y' = b·x + d·y + f
  ctx.setTransform(tt.a, tt.b, -tt.b, tt.a, tt.tx, tt.ty);
  ctx.drawImage(src, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return out;
}
