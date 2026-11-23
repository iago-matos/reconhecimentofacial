/**
 * Preferências deste aparelho (só conveniência de interface; nada biométrico).
 * Guardadas no localStorage; se o navegador bloquear, valem os padrões.
 */
export interface Settings {
  /** Mostra o botão "Capturar com prova de vida" na consulta por rosto. Desligado por padrão:
   *  numa abordagem o policial já vê a pessoa; a função serve mais para auditoria. */
  livenessButton: boolean;
}

export const DEFAULT_SETTINGS: Settings = { livenessButton: false };

const KEY = "pmsc-preferencias";

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { livenessButton: parsed.livenessButton === true };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* sem armazenamento: a preferência vale só nesta sessão */
  }
}
