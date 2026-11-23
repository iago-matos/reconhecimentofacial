import { dist } from "@/lib/recognition/geometry";
import type { EyeGeometry, FaceLandmarks } from "@/lib/recognition/landmarks";

/**
 * Prova de vida ATIVA: durante alguns segundos a câmera acompanha o rosto e exige
 * uma piscada ou um giro de cabeça — coisas que uma foto impressa ou uma foto parada
 * numa tela não fazem.
 *
 * Por que ativa: os modelos passivos de imagem única do Human (antispoof/liveness) foram
 * testados neste projeto e não detectaram fotos de tela nem impressas simuladas
 * (ver BIOMETRIA.md). Desafio-resposta é a abordagem clássica quando não há sensor de profundidade.
 *
 * Limite honesto: um VÍDEO da pessoa piscando, exibido numa tela, passa no teste.
 */

/**
 * "Eye aspect ratio" (Soukupová & Čech, 2016): abertura média das pálpebras ÷ largura do olho.
 * Olho aberto ≈ 0,25–0,35; fechado ≈ 0,05–0,12. Independe da distância da câmera.
 */
export function eyeAspectRatio(e: EyeGeometry): number {
  // Contorno: [canto externo, 7 pontos da pálpebra superior, canto interno, 7 da inferior (de volta)].
  const c = e.contour;
  if (c.length < 16 || e.width <= 0) return NaN;
  let sum = 0;
  for (let i = 2; i <= 6; i++) sum += dist(c[i], c[16 - i]); // pares superior/inferior do meio do olho
  return sum / 5 / e.width;
}

export function faceEAR(l: FaceLandmarks): number {
  return (eyeAspectRatio(l.od) + eyeAspectRatio(l.oe)) / 2;
}

export interface LiveSample {
  /** Tempo em ms desde o início. */
  t: number;
  ear: number;
  /** Rotação horizontal da cabeça (graus). */
  yaw: number;
}

export type LivenessMethod = "piscada" | "giro";

export interface LivenessResult {
  passed: boolean;
  method: LivenessMethod | null;
  /** Abertura típica do olho aberto nesta pessoa. */
  baselineEar: number;
  /** Menor abertura vista, relativa à típica (1 = sempre aberto). */
  minEarRatio: number;
  /** Maior variação de giro observada (graus). */
  yawRange: number;
  samples: number;
}

export const LIVENESS = {
  /** Olho "fechado": abertura abaixo de 60% da típica. */
  closedRatio: 0.6,
  /** Olho "aberto de novo": acima de 85% da típica. */
  openRatio: 0.85,
  /** Giro mínimo da cabeça para valer como movimento (graus). */
  minYawRange: 18,
  /** Amostras mínimas para decidir. */
  minSamples: 6,
  /** Tempo máximo do desafio (ms). */
  timeoutMs: 6000,
} as const;

function percentile(v: number[], p: number): number {
  const s = [...v].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))];
}

/**
 * Analisa a sequência: passa se houver uma piscada completa (aberto → fechado → aberto)
 * ou um giro de cabeça de pelo menos `minYawRange` graus.
 */
export function analyzeLiveness(samples: LiveSample[]): LivenessResult {
  const valid = samples.filter((s) => Number.isFinite(s.ear) && Number.isFinite(s.yaw));
  const base: LivenessResult = { passed: false, method: null, baselineEar: NaN, minEarRatio: 1, yawRange: 0, samples: valid.length };
  if (valid.length < LIVENESS.minSamples) return base;

  const baselineEar = percentile(valid.map((s) => s.ear), 80);
  const ratios = valid.map((s) => s.ear / baselineEar);
  const minEarRatio = Math.min(...ratios);
  const yaws = valid.map((s) => s.yaw);
  const yawRange = Math.max(...yaws) - Math.min(...yaws);

  // Piscada: algum ponto fechado com olho aberto antes E depois dele.
  let blinked = false;
  for (let i = 0; i < ratios.length && !blinked; i++) {
    if (ratios[i] >= LIVENESS.closedRatio) continue;
    const before = ratios.slice(0, i).some((r) => r >= LIVENESS.openRatio);
    const after = ratios.slice(i + 1).some((r) => r >= LIVENESS.openRatio);
    blinked = before && after;
  }
  const turned = yawRange >= LIVENESS.minYawRange;
  return {
    passed: blinked || turned,
    method: blinked ? "piscada" : turned ? "giro" : null,
    baselineEar,
    minEarRatio,
    yawRange,
    samples: valid.length,
  };
}

export type LivenessStatus =
  | { kind: "comprovada"; method: LivenessMethod }
  | { kind: "nao_comprovada" }
  | { kind: "nao_verificada" }
  | { kind: "arquivo" };

export const LIVENESS_TEXT: Record<LivenessStatus["kind"], string> = {
  comprovada: "Prova de vida comprovada",
  nao_comprovada: "Prova de vida não comprovada: a pessoa não piscou nem virou o rosto. Pode ser foto de foto ou de tela.",
  nao_verificada: "Prova de vida não verificada nesta captura.",
  arquivo: "Foto enviada do aparelho: não comprova que a pessoa estava presente.",
};
