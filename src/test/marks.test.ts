import { describe, expect, it } from "vitest";
import { formatMark, isEmptyQuery, normalizeText, searchByMarks, type MarkQuery } from "@/lib/marks";
import { person } from "./fixtures";

const joao = person("joao", [], [
  { type: "tatuagem", region: "antebraco", side: "esquerdo", description: "Carpa colorida com flores" },
  { type: "cicatriz", region: "rosto", side: "direito", description: "Corte na sobrancelha" },
]);
const pedro = person("pedro", [], [{ type: "tatuagem", region: "braco", side: "direito", description: "Nome Ana e coração" }]);
const maria = person("maria", [], [{ type: "tatuagem", region: "costas", description: "Asas de anjo" }]);
const all = [joao, pedro, maria];
const ids = (q: MarkQuery) => searchByMarks(all, q).map((h) => h.person.id);

describe("busca por marcas", () => {
  it("consulta vazia não retorna nada", () => {
    expect(isEmptyQuery({ text: "  de " })).toBe(true);
    expect(ids({})).toEqual([]);
  });
  it("filtra pelo tipo", () => {
    expect(ids({ type: "cicatriz" })).toEqual(["joao"]);
  });
  it("palavra-chave sem acento e por início de palavra", () => {
    expect(ids({ text: "CORACAO" })).toEqual(["pedro"]);
    expect(ids({ text: "carp" })).toEqual(["joao"]);
  });
  it("região exata vem antes da região vizinha; região distante fica de fora", () => {
    expect(ids({ type: "tatuagem", region: "antebraco" })).toEqual(["joao", "pedro"]);
  });
  it("lado diferente não exclui (testemunhas confundem lados), mas lado igual pontua mais", () => {
    expect(ids({ type: "tatuagem", region: "braco", side: "esquerdo" })).toEqual(["pedro", "joao"]);
  });
  it("palavra que não existe na descrição exclui a marca", () => {
    expect(ids({ type: "tatuagem", text: "palhaço" })).toEqual([]);
  });
});

describe("textos", () => {
  it("normaliza acentos e pontuação", () => {
    expect(normalizeText("  Coração, ÁGUIA!  ")).toBe("coracao aguia");
  });
  it("formata a marca de forma legível", () => {
    expect(formatMark(joao.marks[0])).toBe("Tatuagem · Antebraço esquerdo · Carpa colorida com flores");
  });
});
