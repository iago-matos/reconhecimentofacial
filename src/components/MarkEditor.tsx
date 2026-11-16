import { useRef, useState } from "react";
import { Camera, Plus, X } from "lucide-react";
import { Button, Field, Select, inputClass } from "@/components/ui";
import { BODY_REGIONS, BODY_SIDES, MARK_TYPES } from "@/lib/marks";
import { fileToDataUrl, validateImageFile } from "@/lib/image";
import { newId, type BodyMark, type BodyRegion, type BodySide, type MarkType } from "@/lib/types";

interface Props {
  initial?: BodyMark;
  onSave: (mark: BodyMark) => void;
  onCancel?: () => void;
}

/** Formulário de uma marca (tatuagem, cicatriz...). */
export default function MarkEditor({ initial, onSave, onCancel }: Props) {
  const [type, setType] = useState<MarkType | "">(initial?.type ?? "");
  const [region, setRegion] = useState<BodyRegion | "">(initial?.region ?? "");
  const [side, setSide] = useState<BodySide | "">(initial?.side ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [photo, setPhoto] = useState<string | undefined>(initial?.photo);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const pickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const problem = validateImageFile(file);
    if (problem) return setError(problem);
    try {
      setPhoto(await fileToDataUrl(file));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const save = () => {
    if (!type) return setError("Escolha o tipo da marca.");
    onSave({
      id: initial?.id ?? newId(),
      type,
      region: region || undefined,
      side: side || undefined,
      description: description.trim(),
      photo,
    });
  };

  return (
    <div className="space-y-3 rounded-lg border border-accent/40 bg-accent/5 p-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Tipo *">
          <Select value={type} onChange={setType} options={MARK_TYPES} placeholder="Selecione" />
        </Field>
        <Field label="Lado">
          <Select value={side} onChange={setSide} options={BODY_SIDES} placeholder="Não informado" />
        </Field>
      </div>
      <Field label="Local do corpo">
        <Select value={region} onChange={setRegion} options={BODY_REGIONS} placeholder="Não informado" />
      </Field>
      <Field label="Descrição" hint="Desenho, cores, palavras escritas, tamanho. Ex.: carpa colorida, nome 'Ana'">
        <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className={`${inputClass} resize-none`} />
      </Field>
      <div className="flex items-center gap-3">
        {photo ? (
          <div className="relative">
            <img src={photo} alt="Foto da marca" className="h-16 w-16 rounded-md border border-border object-cover" />
            <button
              type="button"
              onClick={() => setPhoto(undefined)}
              className="absolute -right-2 -top-2 rounded-full bg-destructive p-1 text-destructive-foreground"
              aria-label="Remover foto da marca"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : null}
        <Button variant="ghost" onClick={() => fileRef.current?.click()}>
          <Camera className="h-4 w-4" /> {photo ? "Trocar foto" : "Foto da marca"}
        </Button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void pickPhoto(e)} />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button variant="accent" className="flex-1" onClick={save}>
          <Plus className="h-4 w-4" /> {initial ? "Salvar marca" : "Adicionar marca"}
        </Button>
      </div>
    </div>
  );
}
