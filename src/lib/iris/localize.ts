import { sample, type GrayImage } from "@/lib/iris/image";

export interface Circle {
  x: number;
  y: number;
  r: number;
}

const DEG = Math.PI / 180;

/** Setores angulares (graus, eixo y para baixo) usados em cada borda. */
export const LIMBUS_SECTORS: [number, number][] = [
  [-35, 50],
  [130, 215],
]; // laterais: as pálpebras costumam cobrir o topo e a base da íris
export const PUPIL_SECTORS: [number, number][] = [[-35, 215]]; // tudo menos a faixa superior (pálpebra)

function angles(sectors: [number, number][], count: number): { cos: Float32Array; sin: Float32Array } {
  const total = sectors.reduce((s, [a, b]) => s + (b - a), 0);
  const cos = new Float32Array(count);
  const sin = new Float32Array(count);
  let k = 0;
  for (const [a, b] of sectors) {
    const n = Math.max(1, Math.round((count * (b - a)) / total));
    for (let i = 0; i < n && k < count; i++, k++) {
      const t = (a + ((i + 0.5) * (b - a)) / n) * DEG;
      cos[k] = Math.cos(t);
      sin[k] = Math.sin(t);
    }
  }
  return { cos: cos.subarray(0, k), sin: sin.subarray(0, k) };
}

function arcMean(img: GrayImage, cx: number, cy: number, r: number, cos: Float32Array, sin: Float32Array): number {
  let s = 0;
  let n = 0;
  for (let i = 0; i < cos.length; i++) {
    const v = sample(img, cx + r * cos[i], cy + r * sin[i]);
    if (!Number.isNaN(v)) {
      s += v;
      n++;
    }
  }
  return n >= cos.length * 0.6 ? s / n : NaN;
}

export interface SearchOptions {
  rMin: number;
  rMax: number;
  /** Centro pode variar ±centerRange px em x e y. */
  centerRange: number;
  centerStep?: number;
  rStep?: number;
  sectors: [number, number][];
  samples?: number;
  /** Centro inicial. */
  cx: number;
  cy: number;
}

export interface CircleFit {
  circle: Circle;
  /** Salto médio de brilho na borda (0..1). Quanto maior, mais nítida a borda encontrada. */
  strength: number;
}

/**
 * Operador integro-diferencial de Daugman (2004):
 *   max_(r,x0,y0) | G_σ(r) * ∂/∂r ∮ I(x,y) ds / 2πr |
 * Procura o círculo em que o brilho médio do arco muda mais bruscamente
 * (escuro dentro → claro fora), tanto para a borda pupila/íris quanto íris/esclera.
 */
export function integroDifferential(img: GrayImage, o: SearchOptions): CircleFit | null {
  const step = o.centerStep ?? 1;
  const rStep = o.rStep ?? 1;
  const { cos, sin } = angles(o.sectors, o.samples ?? 64);
  const nR = Math.floor((o.rMax - o.rMin) / rStep) + 1;
  if (nR < 5) return null;
  const prof = new Float32Array(nR);
  let best: CircleFit | null = null;
  for (let dy = -o.centerRange; dy <= o.centerRange; dy += step) {
    for (let dx = -o.centerRange; dx <= o.centerRange; dx += step) {
      const cx = o.cx + dx;
      const cy = o.cy + dy;
      for (let k = 0; k < nR; k++) prof[k] = arcMean(img, cx, cy, o.rMin + k * rStep, cos, sin);
      // Derivada central suavizada (núcleo [1,2,0,-2,-1]/8 ≈ derivada de gaussiana).
      for (let k = 2; k < nR - 2; k++) {
        const d = (2 * (prof[k + 1] - prof[k - 1]) + (prof[k + 2] - prof[k - 2])) / (8 * rStep);
        if (Number.isNaN(d)) continue;
        const strength = d * 4; // variação de brilho em ~4 px (independe do passo da busca)
        if (!best || strength > best.strength) best = { circle: { x: cx, y: cy, r: o.rMin + k * rStep }, strength };
      }
    }
  }
  return best;
}

/** Busca em duas etapas (grossa e fina) para ficar rápido mesmo com íris grandes. */
export function fitCircle(img: GrayImage, o: SearchOptions): CircleFit | null {
  const coarseStep = Math.max(1, Math.round(o.centerRange / 6));
  const coarse = integroDifferential(img, { ...o, centerStep: coarseStep, rStep: Math.max(1, (o.rMax - o.rMin) / 40) });
  if (!coarse) return null;
  const fine = integroDifferential(img, {
    ...o,
    cx: coarse.circle.x,
    cy: coarse.circle.y,
    centerRange: coarseStep,
    centerStep: 1,
    rMin: Math.max(o.rMin, coarse.circle.r - 3 * Math.max(1, (o.rMax - o.rMin) / 40)),
    rMax: Math.min(o.rMax, coarse.circle.r + 3 * Math.max(1, (o.rMax - o.rMin) / 40)),
    rStep: 0.5,
  });
  return fine && fine.strength >= coarse.strength * 0.8 ? fine : coarse;
}

export interface Localization {
  iris: Circle;
  pupil: Circle;
  irisStrength: number;
  pupilStrength: number;
  /** A borda da pupila não ficou nítida (comum em íris escura sob luz visível): foi usado um círculo estimado. */
  pupilEstimated: boolean;
}

/** Abaixo disso a borda da pupila é considerada não encontrada. */
export const MIN_PUPIL_STRENGTH = 0.035;
/** Razão pupila/íris usada quando a pupila não é encontrada. */
export const DEFAULT_PUPIL_RATIO = 0.38;

/**
 * Refina íris e pupila a partir da estimativa da malha facial (centro + raio aproximados).
 * `img` deve estar levemente desfocada (σ ≈ 1–2 px) para que cílios e textura não pareçam bordas.
 */
export function localizeIris(img: GrayImage, guess: Circle): Localization | null {
  const iris = fitCircle(img, {
    cx: guess.x,
    cy: guess.y,
    rMin: guess.r * 0.78,
    rMax: guess.r * 1.25,
    centerRange: Math.max(2, Math.round(guess.r * 0.15)),
    sectors: LIMBUS_SECTORS,
  });
  if (!iris) return null;
  const R = iris.circle.r;
  const pupil = fitCircle(img, {
    cx: iris.circle.x,
    cy: iris.circle.y,
    rMin: R * 0.18,
    rMax: R * 0.68,
    centerRange: Math.max(2, Math.round(R * 0.12)),
    sectors: PUPIL_SECTORS,
  });
  const ok = !!pupil && pupil.strength >= MIN_PUPIL_STRENGTH && isInside(pupil.circle, iris.circle);
  return {
    iris: iris.circle,
    irisStrength: iris.strength,
    pupil: ok ? pupil!.circle : { x: iris.circle.x, y: iris.circle.y, r: R * DEFAULT_PUPIL_RATIO },
    pupilStrength: pupil?.strength ?? 0,
    pupilEstimated: !ok,
  };
}

function isInside(inner: Circle, outer: Circle): boolean {
  return Math.hypot(inner.x - outer.x, inner.y - outer.y) + inner.r < outer.r * 0.95;
}
