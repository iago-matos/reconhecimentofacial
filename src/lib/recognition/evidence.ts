import { SCORE_BANDS, type Band, type MatchMode } from "@/lib/recognition/match";
import { IRIS_BANDS, type IrisBand } from "@/lib/iris/match";

/**
 * Régua de evidência: converte a pontuação numa posição (0..1) com as marcas medidas
 * na calibração em pontos fixos, para o policial ver "quão longe" o resultado está de cada limiar.
 */
export interface RulerTick {
  at: number;
  label: string;
}

const clamp = (v: number) => Math.min(1, Math.max(0, v));

/** Interpolação linear por partes entre pontos (valor → posição). `stops` em ordem crescente de valor. */
function piecewise(v: number, stops: [value: number, pos: number][]): number {
  if (v <= stops[0][0]) {
    const [[v0, p0], [v1, p1]] = stops;
    return clamp(p0 - ((v0 - v) / (v1 - v0)) * (p1 - p0));
  }
  for (let i = 1; i < stops.length; i++) {
    const [va, pa] = stops[i - 1];
    const [vb, pb] = stops[i];
    if (v <= vb) return clamp(pa + ((v - va) / (vb - va)) * (pb - pa));
  }
  const [va, pa] = stops[stops.length - 2];
  const [vb, pb] = stops[stops.length - 1];
  return clamp(pb + ((v - vb) / (vb - va)) * (pb - pa));
}

export const FACE_TICKS: RulerTick[] = [
  { at: 0.25, label: "1 em 100" },
  { at: 0.5, label: "1 em 1.000" },
  { at: 0.75, label: "1 em 10 mil" },
];

export function faceRulerPosition(score: number, mode: MatchMode): number {
  const b = SCORE_BANDS[mode];
  return piecewise(score, [
    [b.minima, 0.25],
    [b.media, 0.5],
    [b.alta, 0.75],
    [b.alta + (b.alta - b.media), 1],
  ]);
}

export const FACE_CAPTION: Record<Band, string> = {
  alta: "Nos testes, só 1 em cada 10 mil pares de pessoas diferentes chegou a este nível.",
  media: "Nos testes, entre 1 em 10 mil e 1 em 1.000 pares de pessoas diferentes chegaram a este nível.",
  baixa: "Pista fraca: nos testes, até 1 em 100 pares de pessoas diferentes chegaram a este nível.",
};

/** Íris: distância de Hamming, menor = mais parecido. 0,5 (olhos diferentes) fica na esquerda. */
export const IRIS_TICKS: RulerTick[] = [
  { at: 0.5, label: "moderada" },
  { at: 0.75, label: "forte" },
];

export function irisRulerPosition(hd: number): number {
  // Valores invertidos (−hd) para a régua crescer da esquerda para a direita.
  return piecewise(-hd, [
    [-0.5, 0],
    [-IRIS_BANDS.moderada, 0.5],
    [-IRIS_BANDS.forte, 0.75],
    [-(IRIS_BANDS.forte - (IRIS_BANDS.moderada - IRIS_BANDS.forte)), 1],
  ]);
}

export const IRIS_CAPTION: Record<IrisBand, string> = {
  forte: "Distância baixa: o padrão é compatível com o mesmo olho. Limiar experimental, ainda sem calibração com olhos reais.",
  moderada: "Distância intermediária: alguma compatibilidade, mas olhos diferentes às vezes chegam aqui em luz comum.",
  fraca: "Distância típica de olhos diferentes (perto de 0,5).",
  inconclusiva: "Poucos pontos da íris em comum para comparar. Capture de novo com o olho bem aberto.",
};
