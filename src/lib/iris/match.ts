import type { IrisCode } from "@/lib/iris/encode";

export interface IrisComparison {
  /** Distância de Hamming fracionária: 0 = códigos idênticos, ~0,5 = olhos diferentes (moeda ao acaso). */
  hd: number;
  /** HD normalizada pelo nº de bits comparados (Daugman, 2006): poucos bits → puxa para 0,5. */
  hdNorm: number;
  /** Deslocamento (em colunas) que deu a menor distância: compensa a rotação do olho. */
  shift: number;
  /** Bits efetivamente comparados. */
  bits: number;
}

/** ±12 colunas de 256 ≈ ±17°. A inclinação da cabeça já é compensada pelos cantos do olho. */
export const MAX_SHIFT = 12;
/** Menos bits que isso em comum: comparação inconclusiva. */
export const MIN_COMMON_BITS = 2500;
/** Referência de bits para a normalização (≈ metade do código válido em uma boa captura). */
export const HD_NORM_REFERENCE = 12000;

export function compareIris(a: IrisCode, b: IrisCode, maxShift = MAX_SHIFT): IrisComparison | null {
  if (a.rows !== b.rows || a.cols !== b.cols || a.scales !== b.scales) return null;
  const W = a.cols;
  const lines = a.scales * a.rows;
  let best: IrisComparison | null = null;
  for (let shift = -maxShift; shift <= maxShift; shift++) {
    let diff = 0;
    let n = 0;
    for (let l = 0; l < lines; l++) {
      const base = l * W;
      for (let j = 0; j < W; j++) {
        const ia = (base + j) * 2;
        const ib = (base + ((j + shift + W) % W)) * 2;
        for (let c = 0; c < 2; c++) {
          if (a.mask[ia + c] & b.mask[ib + c]) {
            n++;
            diff += a.bits[ia + c] ^ b.bits[ib + c];
          }
        }
      }
    }
    if (n < MIN_COMMON_BITS) continue;
    const hd = diff / n;
    if (!best || hd < best.hd) best = { hd, hdNorm: normalizeHd(hd, n), shift, bits: n };
  }
  return best;
}

export function normalizeHd(hd: number, bits: number): number {
  return 0.5 - (0.5 - hd) * Math.sqrt(Math.min(1, bits / HD_NORM_REFERENCE));
}

/**
 * Faixas para íris em LUZ VISÍVEL (experimental).
 * Em infravermelho, sistemas comerciais usam HD ≈ 0,32–0,33 como limiar (Daugman, 2006).
 * Em luz visível a textura é pior, então o limiar é mais exigente para "forte" e só serve
 * como confirmação quando o rosto já indicou o mesmo candidato.
 * NÃO calibrado com olhos reais desta população: recalibrar antes de uso real.
 */
export const IRIS_BANDS = { forte: 0.3, moderada: 0.36 } as const;

export type IrisBand = "forte" | "moderada" | "fraca" | "inconclusiva";

export function irisBand(c: IrisComparison | null): IrisBand {
  if (!c) return "inconclusiva";
  if (c.hdNorm <= IRIS_BANDS.forte) return "forte";
  if (c.hdNorm <= IRIS_BANDS.moderada) return "moderada";
  return "fraca";
}
