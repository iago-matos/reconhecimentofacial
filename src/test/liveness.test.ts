import { describe, expect, it } from "vitest";
import { analyzeLiveness, eyeAspectRatio, type LiveSample } from "@/lib/recognition/liveness";
import type { EyeGeometry } from "@/lib/recognition/landmarks";
import type { Pt } from "@/lib/recognition/geometry";

/** Olho de 60 px de largura com abertura `open` (px) no meio. */
function eye(open: number): EyeGeometry {
  const upper: Pt[] = [1, 2, 3, 4, 5, 6, 7].map((k) => [k * 7.5, 100 - (open / 2) * Math.sin((k * Math.PI) / 8)]);
  const lower: Pt[] = [1, 2, 3, 4, 5, 6, 7].map((k) => [k * 7.5, 100 + (open / 2) * Math.sin((k * Math.PI) / 8)]);
  return { side: "od", outer: [0, 100], inner: [60, 100], contour: [[0, 100], ...upper, [60, 100], ...lower.reverse()], irisCenter: null, irisRadius: null, center: [30, 100], width: 60 };
}

const seq = (ears: number[], yaws: number[] = ears.map(() => 0)): LiveSample[] => ears.map((ear, i) => ({ t: i * 100, ear, yaw: yaws[i] }));

describe("abertura do olho (EAR)", () => {
  it("cai quando o olho fecha e não depende do tamanho do olho na foto", () => {
    expect(eyeAspectRatio(eye(18))).toBeGreaterThan(eyeAspectRatio(eye(4)) * 3);
    const big = eye(18);
    const scaled: EyeGeometry = { ...big, contour: big.contour.map(([x, y]) => [x * 3, y * 3] as Pt), width: 180 };
    expect(eyeAspectRatio(scaled)).toBeCloseTo(eyeAspectRatio(big));
  });
});

describe("prova de vida ativa", () => {
  it("passa com uma piscada completa (aberto → fechado → aberto)", () => {
    const r = analyzeLiveness(seq([0.3, 0.31, 0.3, 0.29, 0.12, 0.08, 0.2, 0.3, 0.31]));
    expect(r.passed).toBe(true);
    expect(r.method).toBe("piscada");
  });
  it("passa com giro de cabeça", () => {
    const r = analyzeLiveness(seq([0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3], [0, 4, 9, 14, 19, 22, 20]));
    expect(r.passed).toBe(true);
    expect(r.method).toBe("giro");
  });
  it("foto parada (olho sempre igual, cabeça parada, só ruído) não passa", () => {
    const noise = [0.3, 0.298, 0.303, 0.301, 0.297, 0.302, 0.299, 0.3, 0.301, 0.298];
    const r = analyzeLiveness(seq(noise, noise.map((_, i) => (i % 2 ? 1.5 : -1.5))));
    expect(r.passed).toBe(false);
  });
  it("olho que fecha e não reabre (ou começa fechado) não conta como piscada", () => {
    expect(analyzeLiveness(seq([0.3, 0.3, 0.3, 0.3, 0.1, 0.08, 0.07])).passed).toBe(false);
    expect(analyzeLiveness(seq([0.08, 0.07, 0.3, 0.3, 0.3, 0.3, 0.3])).passed).toBe(false);
  });
  it("com poucas amostras não decide", () => {
    expect(analyzeLiveness(seq([0.3, 0.1, 0.3])).passed).toBe(false);
  });
});
