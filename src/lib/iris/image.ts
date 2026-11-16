/** Imagem em tons de cinza (0..1) e operações básicas usadas pelo módulo de íris. Sem DOM: roda também nos testes. */

export interface GrayImage {
  width: number;
  height: number;
  data: Float32Array;
}

/** Recorte RGBA de uma imagem maior (offset = posição do recorte na imagem original). */
export interface RgbaRegion {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
  offsetX: number;
  offsetY: number;
}

export type Channel = "red" | "luma";

export function toGray(region: RgbaRegion, channel: Channel): GrayImage {
  const { width, height, data } = region;
  const out = new Float32Array(width * height);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    out[i] = channel === "red" ? data[p] / 255 : (0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]) / 255;
  }
  return { width, height, data: out };
}

/** Interpolação bilinear; NaN fora da imagem. */
export function sample(img: GrayImage, x: number, y: number): number {
  if (x < 0 || y < 0 || x > img.width - 1 || y > img.height - 1) return NaN;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, img.width - 1);
  const y1 = Math.min(y0 + 1, img.height - 1);
  const fx = x - x0;
  const fy = y - y0;
  const d = img.data;
  const w = img.width;
  const top = d[y0 * w + x0] * (1 - fx) + d[y0 * w + x1] * fx;
  const bot = d[y1 * w + x0] * (1 - fx) + d[y1 * w + x1] * fx;
  return top * (1 - fy) + bot * fy;
}

function kernel(sigma: number): Float32Array {
  const r = Math.max(1, Math.ceil(sigma * 3));
  const k = new Float32Array(2 * r + 1);
  let s = 0;
  for (let i = -r; i <= r; i++) s += k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma));
  for (let i = 0; i < k.length; i++) k[i] /= s;
  return k;
}

/** Desfoque gaussiano separável (bordas replicadas). */
export function gaussianBlur(img: GrayImage, sigma: number): GrayImage {
  if (sigma <= 0) return img;
  const k = kernel(sigma);
  const r = (k.length - 1) / 2;
  const { width: w, height: h } = img;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -r; i <= r; i++) s += k[i + r] * img.data[y * w + Math.min(w - 1, Math.max(0, x + i))];
      tmp[y * w + x] = s;
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -r; i <= r; i++) s += k[i + r] * tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x];
      out[y * w + x] = s;
    }
  return { width: w, height: h, data: out };
}

/** Redução por média de blocos (fator inteiro ≥ 1). */
export function downscale(img: GrayImage, factor: number): GrayImage {
  const f = Math.max(1, Math.floor(factor));
  if (f === 1) return img;
  const w = Math.floor(img.width / f);
  const h = Math.floor(img.height / f);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let j = 0; j < f; j++) for (let i = 0; i < f; i++) s += img.data[(y * f + j) * img.width + x * f + i];
      out[y * w + x] = s / (f * f);
    }
  return { width: w, height: h, data: out };
}

/** Variância do Laplaciano: medida clássica de nitidez (foco). */
export function laplacianVariance(img: GrayImage, inside?: (x: number, y: number) => boolean): number {
  const { width: w, height: h, data: d } = img;
  let s = 0, s2 = 0, n = 0;
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      if (inside && !inside(x, y)) continue;
      const i = y * w + x;
      const v = d[i - 1] + d[i + 1] + d[i - w] + d[i + w] - 4 * d[i];
      s += v; s2 += v * v; n++;
    }
  if (n < 10) return 0;
  const m = s / n;
  return s2 / n - m * m;
}

export function percentile(values: ArrayLike<number>, p: number): number {
  const arr = Array.from(values).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!arr.length) return NaN;
  const idx = Math.min(arr.length - 1, Math.max(0, Math.round((p / 100) * (arr.length - 1))));
  return arr[idx];
}
