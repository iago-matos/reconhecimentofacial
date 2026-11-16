import type { GrayImage } from "@/lib/iris/image";
import { similarityFromTwoPoints, type Pt, type Similarity } from "@/lib/recognition/geometry";

/**
 * Etapa 2 — reconhecimento periocular (região dos olhos: pálpebras, sobrancelhas, formato e pele ao redor).
 *
 * Funciona com câmera comum em luz visível e continua útil quando a parte de baixo do rosto
 * está coberta (máscara, balaclava, gola, barba nova). Referências: Park, Ross & Jain (2009);
 * Hernandez-Diaz, Alonso-Fernandez & Bigun (2018), que mostram que redes treinadas em rostos
 * extraem bons descritores da região periocular.
 *
 * Duas representações:
 *   - "deep": o mesmo ArcFace aplicado ao rosto alinhado com tudo abaixo do nariz apagado
 *     (o vetor passa a depender só de olhos, sobrancelhas e testa);
 *   - "textura": LBP + HOG na faixa dos olhos (descritores clássicos de periocular),
 *     independentes do modelo de rosto.
 */

/** No rosto alinhado 112×112, linhas a partir desta são apagadas (os olhos ficam em y≈52, o nariz em y≈72). */
export const PERIOCULAR_MASK_ROW = 66;

/** Copia o rosto alinhado apagando (cinza neutro) tudo abaixo de `row`. */
export function maskBelow(aligned: HTMLCanvasElement, row = PERIOCULAR_MASK_ROW): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = aligned.width;
  c.height = aligned.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(aligned, 0, 0);
  ctx.fillStyle = "rgb(128,128,128)";
  ctx.fillRect(0, row, c.width, c.height - row);
  return c;
}

/** Faixa dos olhos normalizada: olhos sempre nas mesmas posições. */
export const STRIP_W = 192;
export const STRIP_H = 96;
const EYE_L: Pt = [52, 50];
const EYE_R: Pt = [140, 50];

export function stripTransform(eyeImageLeft: Pt, eyeImageRight: Pt): Similarity {
  return similarityFromTwoPoints(eyeImageLeft, eyeImageRight, EYE_L, EYE_R);
}

// ---------- LBP uniforme (8 vizinhos, raio 1) ----------
const UNIFORM = (() => {
  const map = new Int16Array(256).fill(58);
  let k = 0;
  for (let v = 0; v < 256; v++) {
    let t = 0;
    for (let b = 0; b < 8; b++) if (((v >> b) & 1) !== ((v >> ((b + 1) % 8)) & 1)) t++;
    if (t <= 2) map[v] = k++;
  }
  return map;
})();

/** Normaliza o brilho/contraste localmente (reduz efeito de luz e sombra). */
function normalizeContrast(img: GrayImage): GrayImage {
  let s = 0, s2 = 0;
  for (const v of img.data) { s += v; s2 += v * v; }
  const n = img.data.length;
  const m = s / n;
  const sd = Math.sqrt(Math.max(1e-6, s2 / n - m * m));
  return { ...img, data: img.data.map((v) => (v - m) / sd) };
}

function l2(v: Float32Array): Float32Array {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map((x) => x / n);
}

export function lbpHistograms(img: GrayImage, cellsX = 8, cellsY = 4): Float32Array {
  const { width: w, height: h, data: d } = img;
  const out = new Float32Array(cellsX * cellsY * 59);
  const cw = (w - 2) / cellsX;
  const ch = (h - 2) / cellsY;
  const off = [-w - 1, -w, -w + 1, 1, w + 1, w, w - 1, -1];
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const c = d[i];
      let code = 0;
      for (let b = 0; b < 8; b++) if (d[i + off[b]] >= c) code |= 1 << b;
      const cell = Math.min(cellsY - 1, Math.floor((y - 1) / ch)) * cellsX + Math.min(cellsX - 1, Math.floor((x - 1) / cw));
      out[cell * 59 + UNIFORM[code]]++;
    }
  // Hellinger (raiz) por célula + L2 global: compara melhor histogramas com cosseno.
  for (let i = 0; i < out.length; i++) out[i] = Math.sqrt(out[i]);
  return l2(out);
}

export function hog(img: GrayImage, cell = 12, bins = 9): Float32Array {
  const { width: w, height: h, data: d } = img;
  const cx = Math.floor(w / cell);
  const cy = Math.floor(h / cell);
  const hist = new Float32Array(cx * cy * bins);
  for (let y = 1; y < cy * cell - 1; y++)
    for (let x = 1; x < cx * cell - 1; x++) {
      const gx = d[y * w + x + 1] - d[y * w + x - 1];
      const gy = d[(y + 1) * w + x] - d[(y - 1) * w + x];
      const mag = Math.hypot(gx, gy);
      let ang = Math.atan2(gy, gx);
      if (ang < 0) ang += Math.PI;
      const b = Math.min(bins - 1, Math.floor((ang / Math.PI) * bins));
      hist[(Math.floor(y / cell) * cx + Math.floor(x / cell)) * bins + b] += mag;
    }
  // Normalização por bloco 2×2 (L2-Hys simplificado).
  const out: number[] = [];
  for (let by = 0; by < cy - 1; by++)
    for (let bx = 0; bx < cx - 1; bx++) {
      const block: number[] = [];
      for (const [dy, dx] of [[0, 0], [0, 1], [1, 0], [1, 1]])
        for (let b = 0; b < bins; b++) block.push(hist[((by + dy) * cx + bx + dx) * bins + b]);
      let n = Math.sqrt(block.reduce((s, v) => s + v * v, 0)) || 1;
      const clipped = block.map((v) => Math.min(0.2, v / n));
      n = Math.sqrt(clipped.reduce((s, v) => s + v * v, 0)) || 1;
      for (const v of clipped) out.push(v / n);
    }
  return l2(Float32Array.from(out));
}

/** Descritor de textura da faixa dos olhos: [LBP | HOG], cada parte com peso igual. */
export function textureDescriptor(strip: GrayImage): number[] {
  const img = normalizeContrast(strip);
  const a = lbpHistograms(img);
  const b = hog(img);
  const out = new Array<number>(a.length + b.length);
  const k = Math.SQRT1_2;
  for (let i = 0; i < a.length; i++) out[i] = a[i] * k;
  for (let i = 0; i < b.length; i++) out[a.length + i] = b[i] * k;
  return out;
}
