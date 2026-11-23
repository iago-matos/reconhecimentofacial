import { useEffect, useMemo, useState } from "react";
import { count } from "@/lib/text";
import { ArrowLeft, Eye, Pencil, Search, Trash2, UserPlus } from "lucide-react";
import DataTools from "@/components/DataTools";
import Preferences from "@/components/Preferences";
import PersonForm from "@/components/PersonForm";
import { Button, Card, Notice, SectionTitle, inputClass } from "@/components/ui";
import { useApp } from "@/state/AppState";
import { formatMark, normalizeText } from "@/lib/marks";
import { EYE_LABEL, displayName, type Person } from "@/lib/types";

const br = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

export default function Persons() {
  const { persons, openPersonId, go } = useApp();
  const [mode, setMode] = useState<"view" | "new" | "edit">("view");
  const [filter, setFilter] = useState("");
  const open = persons.find((p) => p.id === openPersonId) ?? null;

  // Abrir uma ficha a partir de outra aba cancela um cadastro/edição pela metade.
  useEffect(() => setMode("view"), [openPersonId]);

  const list = useMemo(() => {
    const f = normalizeText(filter);
    if (!f) return persons;
    return persons.filter((p) => normalizeText(`${p.name} ${p.alias} ${p.notes}`).includes(f));
  }, [persons, filter]);

  if (mode === "new") return <PersonForm onCancel={() => setMode("view")} onDone={(p) => { setMode("view"); go("pessoas", p.id); }} />;
  if (mode === "edit" && open) return <PersonForm person={open} onCancel={() => setMode("view")} onDone={() => setMode("view")} />;
  if (open) return <PersonDetail person={open} onBack={() => go("pessoas")} onEdit={() => setMode("edit")} />;

  return (
    <div className="space-y-4">
      <SectionTitle
        right={
          <Button variant="primary" onClick={() => setMode("new")}>
            <UserPlus className="h-4 w-4" /> Nova
          </Button>
        }
      >
        Pessoas ({persons.length})
      </SectionTitle>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Buscar por nome ou apelido" className={`${inputClass} pl-9`} />
      </div>

      {persons.length === 0 ? (
        <Notice tone="info">Nenhuma pessoa cadastrada neste aparelho.</Notice>
      ) : list.length === 0 ? (
        <Notice tone="warn">Ninguém encontrado com esse nome.</Notice>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {list.map((p) => (
            <li key={p.id}>
              <button onClick={() => go("pessoas", p.id)} className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/50">
                {p.photos.at(-1) ? (
                  <img src={p.photos.at(-1)!.image} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" />
                ) : (
                  <div className="h-12 w-12 shrink-0 rounded-md bg-muted" />
                )}
                <div className="min-w-0">
                  <p className="truncate font-heading">{displayName(p)}</p>
                  <p className="text-xs text-muted-foreground">
                    {[count(p.photos.length, "foto", "fotos"), count((p.iris ?? []).length, "amostra de íris", "amostras de íris", "sem íris"), count(p.marks.length, "marca", "marcas")].join(", ")}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <DataTools />
      <Preferences />
      <p className="text-center text-xs text-muted-foreground">Projeto acadêmico da Faculdade Municipal de Palhoça.</p>
    </div>
  );
}

function PersonDetail({ person, onBack, onEdit }: { person: Person; onBack: () => void; onEdit: () => void }) {
  const { removePerson, go } = useApp();
  const iris = person.iris ?? [];
  const photos = [...person.photos].sort((a, b) => b.takenAt.localeCompare(a.takenAt));

  const remove = async () => {
    if (!window.confirm(`Excluir a ficha de ${displayName(person)}? Esta ação não pode ser desfeita.`)) return;
    await removePerson(person);
    onBack();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={onBack} aria-label="Voltar">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h2 className="min-w-0 flex-1 break-words text-lg">{displayName(person)}</h2>
      </div>

      <Card className="space-y-2">
        <h3 className="text-sm text-muted-foreground">Fotos do rosto (mais recente primeiro)</h3>
        {photos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem fotos.</p>
        ) : (
          <ul className="grid grid-cols-3 gap-2">
            {photos.map((p) => (
              <li key={p.id}>
                <img src={p.image} alt="" className="aspect-square w-full rounded-md border border-border object-cover" />
                <p className="text-center text-xs text-muted-foreground">{br(p.takenAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="space-y-2">
        <h3 className="text-sm text-muted-foreground">Íris (experimental)</h3>
        {iris.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem íris cadastrada. Use "Editar" para capturar.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-2">
            {iris.map((s) => (
              <li key={s.id}>
                <img src={s.image} alt={EYE_LABEL[s.eye]} className="w-full rounded-md border border-border" />
                <p className="text-center text-xs text-muted-foreground">
                  {EYE_LABEL[s.eye]}, {br(s.capturedAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
        <Button className="w-full" onClick={() => go("iris", person.id)}>
          <Eye className="h-4 w-4" /> Conferir íris desta pessoa
        </Button>
      </Card>

      <Card className="space-y-2">
        <h3 className="text-sm text-muted-foreground">Tatuagens, cicatrizes e sinais</h3>
        {person.marks.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma registrada.</p>
        ) : (
          <ul className="space-y-2">
            {person.marks.map((m) => (
              <li key={m.id} className="flex items-start gap-3">
                {m.photo && <img src={m.photo} alt="" className="h-20 w-20 shrink-0 rounded-md object-cover" />}
                <span className="text-sm">{formatMark(m)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {person.notes && (
        <Card>
          <h3 className="mb-1 text-sm text-muted-foreground">Observações</h3>
          <p className="whitespace-pre-wrap text-sm">{person.notes}</p>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        Cadastrado em {br(person.createdAt)}, atualizado em {br(person.updatedAt)}.
      </p>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="danger" onClick={() => void remove()}>
          <Trash2 className="h-4 w-4" /> Excluir
        </Button>
        <Button variant="primary" onClick={onEdit}>
          <Pencil className="h-4 w-4" /> Editar
        </Button>
      </div>
    </div>
  );
}
