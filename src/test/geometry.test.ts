import { describe, expect, it } from "vitest";
import { applySimilarity, estimateSimilarity, insidePolygon, invertSimilarity, type Pt } from "@/lib/recognition/geometry";

describe("transformação de similaridade", () => {
  const truth = { a: 0.8 * Math.cos(0.3), b: 0.8 * Math.sin(0.3), tx: 12, ty: -7 };
  const src: Pt[] = [[10, 20], [80, 22], [45, 60], [20, 95], [75, 93]];
  const dst = src.map((p) => applySimilarity(truth, p));

  it("recupera a transformação exata a partir dos 5 pontos", () => {
    const t = estimateSimilarity(src, dst);
    expect(t.a).toBeCloseTo(truth.a, 6);
    expect(t.b).toBeCloseTo(truth.b, 6);
    expect(t.tx).toBeCloseTo(truth.tx, 6);
    expect(t.ty).toBeCloseTo(truth.ty, 6);
  });

  it("a inversa desfaz a transformação", () => {
    const inv = invertSimilarity(truth);
    const p = applySimilarity(inv, applySimilarity(truth, [33, 44]));
    expect(p[0]).toBeCloseTo(33, 6);
    expect(p[1]).toBeCloseTo(44, 6);
  });

  it("ponto dentro de polígono", () => {
    const sq: Pt[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    expect(insidePolygon([5, 5], sq)).toBe(true);
    expect(insidePolygon([15, 5], sq)).toBe(false);
  });
});
