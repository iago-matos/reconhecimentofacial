import { serializeCode } from "@/lib/iris/encode";
import type { ProbeEye } from "@/lib/iris/verify";
import type { IrisCaptureResult } from "@/lib/recognition/engine";
import { IRIS_MODEL_ID, newId, today, type EyeSide, type IrisSample } from "@/lib/types";

/** Olhos da captura que podem ser usados (localizados e sem qualidade "ruim"). */
export function usableEyes(r: IrisCaptureResult): EyeSide[] {
  return r.eyes.filter((e) => e.extraction && e.extraction.quality.grade !== "ruim").map((e) => e.side);
}

export function probeEyes(r: IrisCaptureResult): ProbeEye[] {
  const ok = new Set(usableEyes(r));
  return r.eyes.filter((e) => ok.has(e.side)).map((e) => ({ eye: e.side, code: e.extraction!.code }));
}

/** Converte os olhos escolhidos em amostras para guardar na ficha. */
export function toIrisSamples(r: IrisCaptureResult, sides: EyeSide[]): IrisSample[] {
  const ok = new Set(usableEyes(r));
  return r.eyes
    .filter((e) => sides.includes(e.side) && ok.has(e.side))
    .map((e) => ({
      id: newId(),
      eye: e.side,
      capturedAt: today(),
      model: IRIS_MODEL_ID,
      code: serializeCode(e.extraction!.code),
      quality: e.extraction!.quality,
      image: e.preview,
    }));
}
