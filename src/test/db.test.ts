import { beforeEach, describe, expect, it } from "vitest";
import { addLog, clearAll, deletePerson, getAllPersons, getLog, LOG_LIMIT, putPersons } from "@/lib/db";
import { person } from "./fixtures";

describe("banco local (IndexedDB)", () => {
  beforeEach(() => clearAll());

  it("salva, lista em ordem alfabética, atualiza e exclui", async () => {
    await putPersons([person("2", [], [], "Zeca"), person("1", [], [], "Ana")]);
    expect((await getAllPersons()).map((p) => p.name)).toEqual(["Ana", "Zeca"]);
    await putPersons([{ ...person("1", [], [], "Ana"), notes: "editado" }]);
    expect((await getAllPersons())[0].notes).toBe("editado");
    await deletePerson("2");
    expect(await getAllPersons()).toHaveLength(1);
  });

  it("registro de uso: mais recente primeiro e limite de retenção", async () => {
    await addLog("cadastro", "primeiro");
    await addLog("edicao", "segundo");
    expect((await getLog()).map((e) => e.detail)).toEqual(["segundo", "primeiro"]);
    for (let i = 0; i < LOG_LIMIT + 5; i++) await addLog("consulta_marca", String(i));
    expect(await getLog(LOG_LIMIT * 2)).toHaveLength(LOG_LIMIT);
  });

  it("apagar tudo limpa pessoas e registros", async () => {
    await putPersons([person("1", [])]);
    await addLog("cadastro", "x");
    await clearAll();
    expect(await getAllPersons()).toEqual([]);
    expect(await getLog()).toEqual([]);
  });
});
