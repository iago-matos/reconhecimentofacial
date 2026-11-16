import { EYE_LINE, MOUTH_LINE } from "@/lib/recognition/align";
import type { RulerTick } from "@/lib/recognition/evidence";

/**
 * Peças da "folha de comparação": o elemento central da interface.
 * A cor nunca diz "é ele": a evidência cresce do cáqui para o branco, e só o policial confirma (verde).
 */

export type Strength = "alta" | "media" | "baixa";

const STRENGTH_PILL: Record<Strength, string> = {
  alta: "bg-foreground text-background",
  media: "bg-muted-foreground text-background",
  baixa: "border border-muted-foreground/60 text-muted-foreground",
};

export function StrengthPill({ strength, children }: { strength: Strength; children: React.ReactNode }) {
  return <span className={`inline-block rounded-md px-2 py-0.5 text-sm font-bold ${STRENGTH_PILL[strength]}`}>{children}</span>;
}

/** Régua com as marcas medidas na calibração e a posição do resultado. */
export function EvidenceRuler({ position, ticks, label }: { position: number; ticks: RulerTick[]; label: string }) {
  const pct = `${Math.round(position * 1000) / 10}%`;
  return (
    <div className="space-y-1" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(position * 100)}>
      <div className="relative h-3 rounded-full bg-secondary">
        <div className="absolute inset-y-0 left-0 rounded-full bg-muted-foreground/70" style={{ width: pct }} />
        {ticks.map((t) => (
          <span key={t.at} className="absolute inset-y-[-3px] w-px bg-background" style={{ left: `${t.at * 100}%` }} aria-hidden />
        ))}
        <span
          className="absolute top-1/2 h-5 w-2 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-foreground shadow-[0_0_0_2px_hsl(var(--card))]"
          style={{ left: pct }}
          aria-hidden
        />
      </div>
      <div className="relative h-4 text-[0.72rem] text-muted-foreground" aria-hidden>
        {ticks.map((t) => (
          <span key={t.at} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${t.at * 100}%` }}>
            {t.label}
          </span>
        ))}
      </div>
    </div>
  );
}

interface SheetImage {
  src: string;
  caption: string;
  /** true = recorte alinhado (olhos/boca em altura fixa). */
  aligned: boolean;
}

/**
 * Folha de comparação: duas fotos do mesmo tamanho, lado a lado.
 * Quando as duas estão alinhadas, linhas de referência dos olhos e da boca atravessam ambas,
 * como numa comparação pericial: diferenças de proporção aparecem a olho nu.
 */
export function CompareSheet({
  left,
  right,
  label,
  aspect = "aspect-square",
}: {
  left: SheetImage;
  right: SheetImage;
  label: string;
  /** Proporção das fotos (rosto: quadrada; olho: 4:3). */
  aspect?: string;
}) {
  const lines = left.aligned && right.aligned;
  return (
    <figure className="border-y border-border bg-background/60" aria-label={label}>
      <div className="relative grid grid-cols-2 gap-px bg-border">
        {[left, right].map((img) => (
          <img key={img.caption} src={img.src} alt={img.caption} className={`${aspect} w-full bg-background object-cover`} />
        ))}
        {lines &&
          [EYE_LINE, MOUTH_LINE].map((y) => (
            <span
              key={y}
              className="pointer-events-none absolute inset-x-0 border-t border-dashed border-foreground/60"
              style={{ top: `${y * 100}%` }}
              aria-hidden
            />
          ))}
      </div>
      <figcaption className="grid grid-cols-2 text-xs text-muted-foreground">
        <span className="px-2 py-1">{left.caption}</span>
        <span className="border-l border-border px-2 py-1">{right.caption}</span>
      </figcaption>
    </figure>
  );
}
