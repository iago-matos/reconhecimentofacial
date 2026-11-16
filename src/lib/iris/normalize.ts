import { sample, type GrayImage } from "@/lib/iris/image";
import type { Circle } from "@/lib/iris/localize";

/** Faixa retangular "desenrolada" da íris (Daugman rubber sheet). */
export interface NormalizedIris {
  /** Colunas = ângulo (0..2π), linhas = raio (pupila → esclera). */
  width: number;
  height: number;
  data: Float32Array;
  /** 1 = pixel válido (íris visível); 0 = pálpebra, cílio, reflexo ou fora da imagem. */
  mask: Uint8Array;
}

export interface NormalizeOptions {
  width?: number;
  height?: number;
  /** Ângulo (rad) da coluna 0. Usar a linha entre os cantos do olho compensa a inclinação da cabeça. */
  angle0?: number;
  /** Faixa radial aproveitada (0 = borda da pupila, 1 = borda da íris). Evita as bordas, onde a localização erra mais. */
  rho0?: number;
  rho1?: number;
  /** Retorna true se o ponto (coordenadas da imagem) deve ser descartado. */
  reject?: (x: number, y: number) => boolean;
}

export const NORM_WIDTH = 256;
export const NORM_HEIGHT = 32;

/**
 * Normalização de Daugman: cada ponto (ρ, θ) vira
 *   (1−ρ)·borda_da_pupila(θ) + ρ·borda_da_íris(θ)
 * o que compensa dilatação da pupila, distância da câmera e círculos não concêntricos.
 */
export function rubberSheet(img: GrayImage, pupil: Circle, iris: Circle, o: NormalizeOptions = {}): NormalizedIris {
  const W = o.width ?? NORM_WIDTH;
  const H = o.height ?? NORM_HEIGHT;
  const rho0 = o.rho0 ?? 0.06;
  const rho1 = o.rho1 ?? 0.94;
  const a0 = o.angle0 ?? 0;
  const data = new Float32Array(W * H);
  const mask = new Uint8Array(W * H);
  for (let j = 0; j < W; j++) {
    const t = a0 + (2 * Math.PI * j) / W;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const px = pupil.x + pupil.r * c;
    const py = pupil.y + pupil.r * s;
    const ix = iris.x + iris.r * c;
    const iy = iris.y + iris.r * s;
    for (let i = 0; i < H; i++) {
      const rho = rho0 + ((rho1 - rho0) * (i + 0.5)) / H;
      const x = (1 - rho) * px + rho * ix;
      const y = (1 - rho) * py + rho * iy;
      const v = sample(img, x, y);
      const k = i * W + j;
      if (Number.isNaN(v) || (o.reject && o.reject(x, y))) {
        data[k] = 0;
        mask[k] = 0;
      } else {
        data[k] = v;
        mask[k] = 1;
      }
    }
  }
  return { width: W, height: H, data, mask };
}

export function validFraction(n: NormalizedIris): number {
  let v = 0;
  for (let i = 0; i < n.mask.length; i++) v += n.mask[i];
  return v / n.mask.length;
}
