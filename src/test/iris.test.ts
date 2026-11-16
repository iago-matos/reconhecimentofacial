import { describe, expect, it } from "vitest";
import { extractIris } from "@/lib/iris/pipeline";
import { compareIris, irisBand } from "@/lib/iris/match";
import { deserializeCode, serializeCode } from "@/lib/iris/encode";
import { blurRegion, renderEye } from "./syntheticEye";

const probe = (seed: number, extra: Parameters<typeof renderEye>[0] extends infer T ? Partial<T> : never = {}) => {
  const { region, eye } = renderEye({ seed, ...extra });
  const r = extractIris(region, eye);
  if (!r) throw new Error("extração falhou");
  return r;
};

describe("localização da íris", () => {
  it("acha íris e pupila mesmo com a malha errando centro e raio", () => {
    const r = probe(1, { meshError: [6, -5, 0.12], noise: 0.02 });
    expect(Math.abs(r.iris.x - 240)).toBeLessThan(2.5);
    expect(Math.abs(r.iris.y - 180)).toBeLessThan(2.5);
    expect(Math.abs(r.iris.r - 100) / 100).toBeLessThan(0.04);
    expect(r.localization.pupilEstimated).toBe(false);
    expect(Math.abs(r.pupil.r - 35)).toBeLessThan(2.5);
  });
});

describe("comparação de códigos", () => {
  const enrol = probe(7, { noise: 0.015 });

  it("mesma íris com rotação, deslocamento, pupila dilatada, ruído e outra luz → distância baixa", () => {
    const again = probe(7, {
      rotation: 6,
      cx: 250,
      cy: 176,
      R: 96,
      pupilRatio: 0.45,
      noise: 0.03,
      noiseSeed: 4,
      brightness: 0.85,
      meshError: [-4, 3, -0.08],
    });
    const c = compareIris(enrol.code, again.code)!;
    expect(c.hd).toBeLessThan(0.25);
    // 6° ≈ 4 colunas de 256
    expect(Math.abs(c.shift)).toBeGreaterThanOrEqual(3);
    expect(Math.abs(c.shift)).toBeLessThanOrEqual(6);
    expect(irisBand(c)).toBe("forte");
  });

  it("íris diferentes → distância perto de 0,5", () => {
    for (const seed of [8, 9, 10]) {
      const other = probe(seed, { noise: 0.015 });
      const c = compareIris(enrol.code, other.code)!;
      expect(c.hd).toBeGreaterThan(0.4);
      expect(irisBand(c)).toBe("fraca");
    }
  });

  it("serializa e recupera o código sem perdas", () => {
    const back = deserializeCode(serializeCode(enrol.code));
    expect(back.bits).toEqual(enrol.code.bits);
    expect(back.mask).toEqual(enrol.code.mask);
    expect(compareIris(enrol.code, back)!.hd).toBe(0);
  });
});

describe("laudo de qualidade", () => {
  it("captura boa", () => {
    const r = probe(3, { noise: 0.01 });
    expect(r.quality.grade).not.toBe("ruim");
    expect(r.quality.usableArea).toBeGreaterThan(0.6);
  });
  it("foto desfocada é rejeitada; desfoque leve (que não altera o código) passa", () => {
    const { region, eye } = renderEye({ seed: 3, noise: 0.02 });
    expect(extractIris(blurRegion(region, 6), eye)!.quality.grade).toBe("ruim");
    expect(extractIris(blurRegion(region, 1), eye)!.quality.grade).toBe("boa");
  });
  it("íris pequena demais é rejeitada", () => {
    const r = probe(3, { R: 40, width: 200, height: 150 });
    expect(r.quality.grade).toBe("ruim");
    expect(r.quality.reasons.join(" ")).toMatch(/pequena/);
  });
});
