import { Card } from "@/components/ui";
import { useApp } from "@/state/AppState";

/** Preferências deste aparelho. */
export default function Preferences() {
  const { settings, updateSettings } = useApp();
  return (
    <Card className="space-y-3">
      <h3 className="text-xl">Preferências</h3>
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 h-5 w-5 shrink-0 accent-[hsl(var(--success))]"
          checked={settings.livenessButton}
          onChange={(e) => updateSettings({ livenessButton: e.target.checked })}
        />
        <span className="space-y-0.5">
          <span className="block">Mostrar "Capturar com prova de vida"</span>
          <span className="block text-sm text-muted-foreground">
            Pede para a pessoa piscar ou virar o rosto antes da foto e registra que ela estava diante da câmera. Útil para
            auditoria; numa abordagem comum não é necessário.
          </span>
        </span>
      </label>
    </Card>
  );
}
