import { gaussianBlur, type RgbaRegion } from "@/lib/iris/image";
import type { EyeGeometry } from "@/lib/recognition/landmarks";
import type { Pt } from "@/lib/recognition/geometry";

/** Gerador pseudoaleatório determinístico (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface EyeOptions {
  /** Identidade da íris (semente da textura). */
  seed: number;
  width?: number;
  height?: number;
  cx?: number;
  cy?: number;
  R?: number;
  /** Raio da pupila / raio da íris. */
  pupilRatio?: number;
  /** Rotação do olho (graus). */
  rotation?: number;
  /** Desvio-padrão do ruído do sensor (0..1). */
  noise?: number;
  noiseSeed?: number;
  brightness?: number;
  /** Erro da estimativa da malha (px no centro, fração no raio). */
  meshError?: [dx: number, dy: number, dr: number];
  /** Cor base da íris (RGB 0..1). */
  irisColor?: [number, number, number];
}

/**
 * Desenha um olho sintético: esclera, íris com textura definida em coordenadas polares
 * (então é a "mesma íris" mesmo com rotação ou pupila dilatada), pupila e pálpebras.
 */
export function renderEye(o: EyeOptions): { region: RgbaRegion; eye: EyeGeometry } {
  const W = o.width ?? 480;
  const H = o.height ?? 360;
  const cx = o.cx ?? W / 2;
  const cy = o.cy ?? H / 2;
  const R = o.R ?? 100;
  const rp = R * (o.pupilRatio ?? 0.35);
  const rot = ((o.rotation ?? 0) * Math.PI) / 180;
  const bright = o.brightness ?? 1;
  const color = o.irisColor ?? [0.55, 0.36, 0.22];
  const rand = rng(o.seed);
  const waves = Array.from({ length: 60 }, () => ({
    f: 0.5 + rand() * 4,
    m: Math.round(3 + rand() * 45) * (rand() < 0.5 ? -1 : 1),
    p: rand() * Math.PI * 2,
    a: 0.5 + rand(),
  }));
  const ampl = waves.reduce((s, w) => s + w.a * w.a, 0) ** 0.5;
  const noise = rng(o.noiseSeed ?? 999);
  const gauss = () => Math.sqrt(-2 * Math.log(noise() + 1e-12)) * Math.cos(2 * Math.PI * noise());

  const eyeW = R * 4.6;
  const lidA = eyeW / 2;
  const lidB = R * 1.1; // abertura vertical: a pálpebra cobre um pouco do topo e da base da íris
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.hypot(dx, dy);
      let rgb: [number, number, number];
      const insideLids = (dx * dx) / (lidA * lidA) + (dy * dy) / (lidB * lidB) <= 1;
      if (!insideLids) rgb = [0.78, 0.58, 0.48];
      else if (d < rp) rgb = [0.04, 0.03, 0.03];
      else if (d < R) {
        const rho = (d - rp) / (R - rp);
        const theta = Math.atan2(dy, dx) - rot;
        let t = 0;
        for (const w of waves) t += w.a * Math.cos(2 * Math.PI * w.f * rho + w.m * theta + w.p);
        const v = 0.75 + 0.3 * (t / ampl);
        rgb = [color[0] * v, color[1] * v, color[2] * v];
      } else rgb = [0.92, 0.9, 0.87];
      const i = (y * W + x) * 4;
      for (let c = 0; c < 3; c++) data[i + c] = Math.round(255 * Math.min(1, Math.max(0, rgb[c] * bright + (o.noise ?? 0) * gauss())));
      data[i + 3] = 255;
    }

  const contour: Pt[] = [];
  for (let k = 0; k <= 8; k++) {
    const t = Math.PI + (k * Math.PI) / 8; // canto externo (esquerda) → topo → canto interno
    contour.push([cx + lidA * Math.cos(t), cy + lidB * Math.sin(t)]);
  }
  for (let k = 1; k < 8; k++) {
    const t = (k * Math.PI) / 8; // base, de volta ao canto externo
    contour.push([cx + lidA * Math.cos(t), cy + lidB * Math.sin(t)]);
  }
  const [ex, ey, er] = o.meshError ?? [0, 0, 0];
  const eye: EyeGeometry = {
    side: "od",
    outer: [cx - lidA, cy],
    inner: [cx + lidA, cy],
    contour,
    irisCenter: [cx + ex, cy + ey],
    irisRadius: R * (1 + er),
    center: [cx, cy],
    width: eyeW,
  };
  return { region: { width: W, height: H, data, offsetX: 0, offsetY: 0 }, eye };
}

/** Desfoque gaussiano por canal (simula foco errado ou mão tremendo). */
export function blurRegion(region: RgbaRegion, sigma: number): RgbaRegion {
  const out = new Uint8ClampedArray(region.data.length);
  const n = region.width * region.height;
  for (let c = 0; c < 3; c++) {
    const g = { width: region.width, height: region.height, data: new Float32Array(n) };
    for (let i = 0; i < n; i++) g.data[i] = region.data[i * 4 + c] / 255;
    const b = gaussianBlur(g, sigma);
    for (let i = 0; i < n; i++) out[i * 4 + c] = Math.round(b.data[i] * 255);
  }
  for (let i = 3; i < out.length; i += 4) out[i] = 255;
  return { ...region, data: out };
}
