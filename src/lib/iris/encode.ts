import type { NormalizedIris } from "@/lib/iris/normalize";

/**
 * Código de íris ("IrisCode"): cada ponto da faixa normalizada é filtrado por um filtro
 * log-Gabor 1D na direção angular (Masek & Kovesi, 2003; Field, 1987) e a FASE da resposta
 * é quantizada em 2 bits (sinal da parte real e da imaginária), como em Daugman (1993).
 *
 * Bits "frágeis" (resposta perto de zero, que mudam de uma foto para outra) são mascarados
 * conforme Hollingsworth, Bowyer & Flynn (2009).
 */
export interface IrisCode {
  rows: number;
  cols: number;
  /** Número de escalas (comprimentos de onda) do filtro. */
  scales: number;
  /** 1 bit por byte; tamanho = scales·rows·cols·2. Índice: ((s·rows + i)·cols + j)·2 + c. */
  bits: Uint8Array;
  /** 1 = bit confiável e comparável. */
  mask: Uint8Array;
}

/** Comprimentos de onda em pixels da faixa normalizada (256 colunas). */
export const WAVELENGTHS = [16, 32];
/** Largura de banda do log-Gabor (σ/f0 = 0,5 ≈ 2 oitavas). */
const SIGMA_ON_F = 0.5;
/** Fração dos bits de menor resposta descartados como frágeis. */
export const FRAGILE_FRACTION = 0.2;
/** Linhas com menos que isso de pixels válidos são descartadas inteiras. */
const MIN_ROW_VALID = 0.3;

// ---------- FFT radix-2 (in-place) ----------
function fft(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const ai = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k + len / 2] = re[i + k] - ar;
        im[i + k + len / 2] = im[i + k] - ai;
        re[i + k] += ar;
        im[i + k] += ai;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

/** Filtro log-Gabor só nas frequências positivas → saída analítica (complexa). */
function logGabor(n: number, wavelength: number): Float64Array {
  const g = new Float64Array(n);
  const f0 = 1 / wavelength;
  const d = 2 * Math.log(SIGMA_ON_F) ** 2;
  for (let k = 1; k <= n / 2; k++) {
    const f = k / n;
    g[k] = Math.exp(-(Math.log(f / f0) ** 2) / d);
  }
  return g;
}

export function encodeIris(norm: NormalizedIris, wavelengths: number[] = WAVELENGTHS): IrisCode {
  const { width: W, height: H } = norm;
  if ((W & (W - 1)) !== 0) throw new Error("A largura normalizada precisa ser potência de 2.");
  const S = wavelengths.length;
  const total = S * H * W * 2;
  const bits = new Uint8Array(total);
  const mask = new Uint8Array(total);
  const mag = new Float32Array(total);
  const re = new Float64Array(W);
  const im = new Float64Array(W);

  for (let s = 0; s < S; s++) {
    const g = logGabor(W, wavelengths[s]);
    for (let i = 0; i < H; i++) {
      let sum = 0;
      let n = 0;
      for (let j = 0; j < W; j++) if (norm.mask[i * W + j]) { sum += norm.data[i * W + j]; n++; }
      if (n < W * MIN_ROW_VALID) continue; // linha inteira inválida (mask fica 0)
      const m = sum / n;
      // Pixels inválidos recebem a média da linha para não criar bordas artificiais.
      for (let j = 0; j < W; j++) { re[j] = norm.mask[i * W + j] ? norm.data[i * W + j] - m : 0; im[j] = 0; }
      fft(re, im, false);
      for (let k = 0; k < W; k++) { re[k] *= g[k]; im[k] *= g[k]; }
      fft(re, im, true);
      for (let j = 0; j < W; j++) {
        const b = ((s * H + i) * W + j) * 2;
        bits[b] = re[j] > 0 ? 1 : 0;
        bits[b + 1] = im[j] > 0 ? 1 : 0;
        if (norm.mask[i * W + j]) {
          mask[b] = 1;
          mask[b + 1] = 1;
          mag[b] = Math.abs(re[j]);
          mag[b + 1] = Math.abs(im[j]);
        }
      }
    }
    // Bits frágeis: por escala, os de menor |resposta|.
    const start = s * H * W * 2;
    const end = start + H * W * 2;
    const vals: number[] = [];
    for (let b = start; b < end; b++) if (mask[b]) vals.push(mag[b]);
    if (vals.length) {
      vals.sort((a, b) => a - b);
      const thr = vals[Math.floor(vals.length * FRAGILE_FRACTION)];
      for (let b = start; b < end; b++) if (mask[b] && mag[b] < thr) mask[b] = 0;
    }
  }
  return { rows: H, cols: W, scales: S, bits, mask };
}

// ---------- serialização compacta (base64 de bits empacotados) ----------
function pack(bits: Uint8Array): Uint8Array {
  const out = new Uint8Array(Math.ceil(bits.length / 8));
  for (let i = 0; i < bits.length; i++) if (bits[i]) out[i >> 3] |= 1 << (i & 7);
  return out;
}
function unpack(bytes: Uint8Array, n: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = (bytes[i >> 3] >> (i & 7)) & 1;
  return out;
}
const toB64 = (b: Uint8Array) => {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export interface SerializedIrisCode {
  rows: number;
  cols: number;
  scales: number;
  bits: string;
  mask: string;
}

export function serializeCode(c: IrisCode): SerializedIrisCode {
  return { rows: c.rows, cols: c.cols, scales: c.scales, bits: toB64(pack(c.bits)), mask: toB64(pack(c.mask)) };
}

export function deserializeCode(s: SerializedIrisCode): IrisCode {
  const n = s.scales * s.rows * s.cols * 2;
  return { rows: s.rows, cols: s.cols, scales: s.scales, bits: unpack(fromB64(s.bits), n), mask: unpack(fromB64(s.mask), n) };
}
