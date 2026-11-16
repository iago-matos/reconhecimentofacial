import { describe, expect, it } from "vitest";
import { faceRulerPosition, irisRulerPosition, FACE_TICKS } from "@/lib/recognition/evidence";
import { SCORE_BANDS } from "@/lib/recognition/match";
import { IRIS_BANDS } from "@/lib/iris/match";

describe("régua de evidência", () => {
  it("põe cada limiar medido exatamente na sua marca", () => {
    for (const mode of ["completo", "coberto"] as const) {
      const b = SCORE_BANDS[mode];
      expect(faceRulerPosition(b.minima, mode)).toBeCloseTo(FACE_TICKS[0].at);
      expect(faceRulerPosition(b.media, mode)).toBeCloseTo(FACE_TICKS[1].at);
      expect(faceRulerPosition(b.alta, mode)).toBeCloseTo(FACE_TICKS[2].at);
    }
  });
  it("cresce com a pontuação e fica entre 0 e 1", () => {
    let last = -1;
    for (let s = -5; s <= 20; s += 0.5) {
      const p = faceRulerPosition(s, "completo");
      expect(p).toBeGreaterThanOrEqual(last);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
      last = p;
    }
  });
  it("íris: distância menor fica mais à direita; limiares nas marcas", () => {
    expect(irisRulerPosition(0.5)).toBeCloseTo(0);
    expect(irisRulerPosition(IRIS_BANDS.moderada)).toBeCloseTo(0.5);
    expect(irisRulerPosition(IRIS_BANDS.forte)).toBeCloseTo(0.75);
    expect(irisRulerPosition(0.1)).toBe(1);
    expect(irisRulerPosition(0.2)).toBeGreaterThan(irisRulerPosition(0.33));
  });
});
