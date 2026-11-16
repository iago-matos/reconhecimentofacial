import { useRef, useState } from "react";
import { Download, History, ShieldAlert, Upload } from "lucide-react";
import { Button, Card, Field, Notice, inputClass } from "@/components/ui";
import { useApp } from "@/state/AppState";
import { MIN_PASSWORD, decryptBackup, encryptBackup } from "@/lib/backup";
import { getLog } from "@/lib/db";
import type { LogEntry } from "@/lib/types";

const ACTION_LABEL: Record<LogEntry["action"], string> = {
  consulta_rosto: "Consulta por rosto",
  consulta_marca: "Consulta por marca",
  consulta_iris: "Consulta por íris",
  confirmacao: "Confirmação",
  cadastro: "Cadastro",
  edicao: "Edição",
  exclusao: "Exclusão",
  exportacao: "Exportação",
  importacao: "Importação",
  apagar_tudo: "Dados apagados",
};

/** Cópia de segurança criptografada, registro de uso e exclusão total dos dados. */
export default function DataTools() {
  const { persons, importPersons, wipeAll, log } = useApp();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [entries, setEntries] = useState<LogEntry[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setMsg(null);
    try {
      setMsg({ tone: "ok", text: await fn() });
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const exportBackup = () =>
    run(async () => {
      const content = await encryptBackup(persons, password);
      const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `base-reconhecimento-${new Date().toISOString().slice(0, 10)}.pmbak`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      log("exportacao", `${persons.length} pessoa(s)`);
      setPassword("");
      return `Cópia salva com ${persons.length} pessoa(s). Guarde a senha: sem ela o arquivo não abre.`;
    });

  const importBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    void run(async () => {
      const incoming = await decryptBackup(await file.text(), password);
      const n = await importPersons(incoming);
      setPassword("");
      return `${n} pessoa(s) importada(s). Fichas com o mesmo identificador foram substituídas.`;
    });
  };

  const wipe = () => {
    const typed = window.prompt('Isto apaga TODAS as pessoas e registros deste aparelho. Digite APAGAR para confirmar.');
    if (typed?.trim().toUpperCase() !== "APAGAR") return;
    void run(async () => {
      await wipeAll();
      setEntries(null);
      return "Todos os dados deste aparelho foram apagados.";
    });
  };

  return (
    <Card className="space-y-4">
      <h2 className="flex items-center gap-2 text-base">
        <ShieldAlert className="h-5 w-5 text-accent" /> Dados e segurança
      </h2>
      <p className="text-sm text-muted-foreground">
        A base fica só neste aparelho e não é enviada para nenhum servidor. Use a cópia de segurança para levar a base para outro
        aparelho. O arquivo é protegido por senha (AES-256).
      </p>

      <Field label="Senha da cópia de segurança" hint={`Mínimo ${MIN_PASSWORD} caracteres. Necessária para exportar e importar.`}>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} autoComplete="new-password" />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => void exportBackup()} disabled={password.length < MIN_PASSWORD || persons.length === 0} busy={busy}>
          <Download className="h-4 w-4" /> Exportar
        </Button>
        <Button onClick={() => fileRef.current?.click()} disabled={password.length < MIN_PASSWORD} busy={busy}>
          <Upload className="h-4 w-4" /> Importar
        </Button>
      </div>
      <input ref={fileRef} type="file" accept=".pmbak,application/json" className="hidden" onChange={importBackup} />
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      <div className="space-y-2">
        <Button variant="ghost" className="w-full" onClick={async () => setEntries(entries ? null : await getLog())}>
          <History className="h-4 w-4" /> {entries ? "Ocultar registro de uso" : "Ver registro de uso"}
        </Button>
        {entries && (
          <ul className="max-h-72 space-y-1 overflow-y-auto rounded-md border border-border p-2 text-xs">
            {entries.length === 0 && <li className="text-muted-foreground">Nenhum registro.</li>}
            {entries.map((e) => (
              <li key={e.id} className="border-b border-border/50 pb-1">
                <span className="text-muted-foreground">{new Date(e.at).toLocaleString("pt-BR")}</span> ·{" "}
                <b>{ACTION_LABEL[e.action]}</b> · {e.detail}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Button variant="danger" className="w-full" onClick={wipe} disabled={busy}>
        Apagar todos os dados deste aparelho
      </Button>
    </Card>
  );
}
