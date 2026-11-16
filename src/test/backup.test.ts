// @vitest-environment node
import { describe, expect, it } from "vitest";
import { decryptBackup, encryptBackup } from "@/lib/backup";
import { person } from "./fixtures";

const base = [person("a", [[0.1, 0.2]], [{ type: "tatuagem", description: "dragão" }])];
const PASS = "senha-forte-123";

describe("cópia de segurança criptografada", () => {
  it("ida e volta com a senha certa", async () => {
    const file = await encryptBackup(base, PASS);
    expect(file).not.toContain("drag"); // conteúdo não aparece em texto puro
    expect(await decryptBackup(file, PASS)).toEqual(base);
  });
  it("recusa senha errada", async () => {
    const file = await encryptBackup(base, PASS);
    await expect(decryptBackup(file, "outra-senha-000")).rejects.toThrow(/Senha incorreta/);
  });
  it("detecta arquivo adulterado", async () => {
    const parsed = JSON.parse(await encryptBackup(base, PASS));
    const bytes = Uint8Array.from(atob(parsed.data), (c) => c.charCodeAt(0));
    bytes[0] ^= 0xff;
    parsed.data = btoa(String.fromCharCode(...bytes));
    await expect(decryptBackup(JSON.stringify(parsed), PASS)).rejects.toThrow(/Senha incorreta ou arquivo corrompido/);
  });
  it("leva junto as amostras de íris e aceita cópias antigas sem íris", async () => {
    const withIris = [{ ...base[0], iris: [{ id: "i1", eye: "od" as const, capturedAt: "2026-01-01", model: "x", code: { rows: 1, cols: 1, scales: 1, bits: "AA==", mask: "AA==" }, quality: {} as never, image: "data:image/jpeg;base64,AA" }] }];
    expect(await decryptBackup(await encryptBackup(withIris, PASS), PASS)).toEqual(withIris);
    const { iris: _i, ...old } = base[0];
    expect(await decryptBackup(await encryptBackup([old], PASS), PASS)).toEqual([old]);
  });
  it("recusa íris malformada", async () => {
    const bad = [{ ...base[0], iris: [{ eye: "x" }] }] as never;
    await expect(decryptBackup(await encryptBackup(bad, PASS), PASS)).rejects.toThrow(/inválido/);
  });
  it("exige senha mínima e formato correto", async () => {
    await expect(encryptBackup(base, "123")).rejects.toThrow(/pelo menos/);
    await expect(decryptBackup(JSON.stringify({ format: "x" }), PASS)).rejects.toThrow(/não é uma cópia/);
  });
});
