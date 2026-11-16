import { describe, expect, it } from "vitest";
import { MESH, fivePoints, landmarksFromMesh } from "@/lib/recognition/landmarks";

/** Malha falsa de 478 pontos com os olhos em x≈100 (cantos 33/133) e x≈300 (cantos 263/362). */
function fakeMesh(irisNear33: number[], irisNear263: number[]): number[][] {
  const mesh = Array.from({ length: 478 }, () => [200, 300, 0]);
  const put = (i: number, x: number, y: number) => (mesh[i] = [x, y, 0]);
  put(MESH.od.outer, 70, 100);
  put(MESH.od.inner, 130, 100);
  MESH.od.upper.forEach((i, k) => put(i, 75 + k * 8, 90));
  MESH.od.lower.forEach((i, k) => put(i, 75 + k * 8, 110));
  put(MESH.oe.outer, 330, 100);
  put(MESH.oe.inner, 270, 100);
  MESH.oe.upper.forEach((i, k) => put(i, 325 - k * 8, 90));
  MESH.oe.lower.forEach((i, k) => put(i, 325 - k * 8, 110));
  const iris = (idx: number[], cx: number, r: number) => {
    put(idx[0], cx, 100);
    put(idx[1], cx + r, 100);
    put(idx[2], cx, 100 - r);
    put(idx[3], cx - r, 100);
    put(idx[4], cx, 100 + r);
  };
  iris(irisNear33, 100, 12);
  iris(irisNear263, 300, 14);
  return mesh;
}

describe("pontos da malha", () => {
  it("associa cada íris ao olho mais próximo (ordem do Human: 473–477 fica nos cantos 33/133)", () => {
    const lm = landmarksFromMesh(fakeMesh([473, 474, 475, 476, 477], [468, 469, 470, 471, 472]))!;
    expect(lm.od.irisCenter).toEqual([100, 100]);
    expect(lm.od.irisRadius).toBeCloseTo(12);
    expect(lm.oe.irisCenter).toEqual([300, 100]);
    expect(lm.oe.irisRadius).toBeCloseTo(14);
  });

  it("continua certo se a biblioteca usar a ordem inversa", () => {
    const lm = landmarksFromMesh(fakeMesh([468, 469, 470, 471, 472], [473, 474, 475, 476, 477]))!;
    expect(lm.od.irisCenter).toEqual([100, 100]);
    expect(lm.oe.irisCenter).toEqual([300, 100]);
  });

  it("sem os pontos de íris (malha de 468) não inventa íris", () => {
    const lm = landmarksFromMesh(fakeMesh([473, 474, 475, 476, 477], [468, 469, 470, 471, 472]).slice(0, 468))!;
    expect(lm.od.irisCenter).toBeNull();
    expect(lm.od.center).toEqual([100, 100]);
  });

  it("5 pontos na ordem do ArcFace: olho à esquerda da imagem primeiro", () => {
    const pts = fivePoints(landmarksFromMesh(fakeMesh([473, 474, 475, 476, 477], [468, 469, 470, 471, 472]))!);
    expect(pts[0][0]).toBeLessThan(pts[1][0]);
  });
});
