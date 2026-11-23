import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "@/lib/settings";

describe("preferências do aparelho", () => {
  beforeEach(() => localStorage.clear());

  it("prova de vida começa escondida", () => {
    expect(DEFAULT_SETTINGS.livenessButton).toBe(false);
    expect(loadSettings().livenessButton).toBe(false);
  });
  it("guarda e recupera a escolha", () => {
    saveSettings({ livenessButton: true });
    expect(loadSettings().livenessButton).toBe(true);
  });
  it("ignora valor corrompido e volta ao padrão", () => {
    localStorage.setItem("pmsc-preferencias", "{quebrado");
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});
