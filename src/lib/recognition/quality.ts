/** Laudo de qualidade do rosto: diz se a foto serve para comparar e o que melhorar. */

export type Grade = "boa" | "aceitavel" | "ruim";

export interface FaceQuality {
  grade: Grade;
  /** Distância entre os olhos na foto (px). ISO/IEC 19794-5 recomenda ≥ 60 px para fotos de documento. */
  interEyePx: number;
  /** Rotação da cabeça (graus). */
  yaw: number;
  pitch: number;
  /** Brilho médio do rosto alinhado (0..1). */
  brightness: number;
  /** Nitidez relativa (variância do Laplaciano ÷ contraste). */
  sharpness: number;
  reasons: string[];
}

export const QUALITY_LIMITS = {
  /**
   * Distância entre olhos (px). O ArcFace trabalha com ~35 px entre os olhos (gabarito 112×112),
   * então acima disso a foto já tem toda a resolução que o modelo usa. LFW: mediana 38 px.
   */
  eyesMin: 20,
  eyesGood: 32,
  yawWarn: 25,
  yawBad: 45,
  pitchWarn: 25,
  pitchBad: 40,
  darkBad: 0.15,
  darkWarn: 0.25,
  brightWarn: 0.85,
  /** Nitidez. No LFW: p1 = 0,057, p5 = 0,072, mediana = 0,118. */
  sharpBad: 0.05,
  sharpWarn: 0.07,
} as const;

export function gradeFace(m: Omit<FaceQuality, "grade" | "reasons">): FaceQuality {
  const L = QUALITY_LIMITS;
  const reasons: string[] = [];
  let grade: Grade = "boa";
  const worse = (g: Grade, why: string) => {
    if (g === "ruim" || (g === "aceitavel" && grade === "boa")) grade = g;
    reasons.push(why);
  };
  if (m.interEyePx < L.eyesMin) worse("ruim", `Rosto muito pequeno na foto (${Math.round(m.interEyePx)} px entre os olhos). Aproxime-se.`);
  else if (m.interEyePx < L.eyesGood) worse("aceitavel", `Rosto pequeno (${Math.round(m.interEyePx)} px entre os olhos); o ideal é ≥ ${L.eyesGood}.`);
  const yaw = Math.abs(m.yaw);
  if (yaw > L.yawBad) worse("ruim", `Rosto muito de lado (${Math.round(yaw)}°).`);
  else if (yaw > L.yawWarn) worse("aceitavel", `Rosto um pouco de lado (${Math.round(yaw)}°).`);
  const pitch = Math.abs(m.pitch);
  if (pitch > L.pitchBad) worse("ruim", `Cabeça muito inclinada para cima/baixo (${Math.round(pitch)}°).`);
  else if (pitch > L.pitchWarn) worse("aceitavel", `Cabeça inclinada para cima/baixo (${Math.round(pitch)}°).`);
  if (m.brightness < L.darkBad) worse("ruim", "Rosto escuro demais.");
  else if (m.brightness < L.darkWarn) worse("aceitavel", "Rosto escuro.");
  else if (m.brightness > L.brightWarn) worse("aceitavel", "Rosto estourado de luz.");
  if (m.sharpness < L.sharpBad) worse("ruim", "Foto borrada ou tremida.");
  else if (m.sharpness < L.sharpWarn) worse("aceitavel", "Foto um pouco borrada.");
  return { ...m, grade, reasons };
}

export const GRADE_LABEL: Record<Grade, string> = { boa: "Qualidade boa", aceitavel: "Qualidade aceitável", ruim: "Qualidade ruim" };
