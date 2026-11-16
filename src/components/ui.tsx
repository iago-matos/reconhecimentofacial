import type { ButtonHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { CircleCheck, Info, Loader2, OctagonAlert, TriangleAlert } from "lucide-react";

/**
 * primary  → vermelho PMSC: a ação principal da tela (capturar, nova consulta)
 * confirm  → verde SC: só ações em que o POLICIAL confirma algo (é esta pessoa, salvar ficha)
 * secondary/ghost → ações de apoio; danger → apagar
 */
type Variant = "primary" | "secondary" | "confirm" | "danger" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-primary text-primary-foreground hover:brightness-110",
  secondary: "bg-secondary text-secondary-foreground hover:brightness-125",
  confirm: "bg-success text-success-foreground hover:brightness-110",
  danger: "bg-destructive text-destructive-foreground hover:brightness-110",
  ghost: "bg-transparent text-muted-foreground hover:text-foreground hover:bg-secondary",
};

export function Button({
  variant = "secondary",
  className = "",
  busy = false,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled || busy}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-lg px-4 py-2 font-heading text-[1.05rem] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${VARIANTS[variant]} ${className}`}
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-border bg-card p-4 ${className}`}>{children}</div>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1">
      <span className="block text-sm text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-base text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus-visible:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50";

export function Select<T extends string>({
  value,
  onChange,
  options,
  placeholder = "Qualquer",
  ...props
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange"> & {
  value: T | "";
  onChange: (v: T | "") => void;
  options: { value: T; label: string }[];
  placeholder?: string;
}) {
  return (
    <select {...props} value={value} onChange={(e) => onChange(e.target.value as T | "")} className={inputClass}>
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

const NOTICE = {
  info: { box: "border-muted-foreground/30 bg-secondary/60", icon: Info, iconClass: "text-muted-foreground" },
  warn: { box: "border-accent/50 bg-accent/10", icon: TriangleAlert, iconClass: "text-accent" },
  error: { box: "border-alert/60 bg-destructive/15", icon: OctagonAlert, iconClass: "text-alert" },
  ok: { box: "border-success-text/50 bg-success/15", icon: CircleCheck, iconClass: "text-success-text" },
} as const;

/** Aviso com ícone: o tom nunca depende só da cor. */
export function Notice({ tone = "info", children }: { tone?: keyof typeof NOTICE; children: ReactNode }) {
  const t = NOTICE[tone];
  const Icon = t.icon;
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`flex gap-2 rounded-lg border px-3 py-2 text-sm text-foreground ${t.box}`}>
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${t.iconClass}`} aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-2xl text-foreground">{children}</h2>
      {right}
    </div>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
