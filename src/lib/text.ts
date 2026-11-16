/** "1 foto", "2 fotos", "sem fotos": evita o "foto(s)" na interface. */
export function count(n: number, singular: string, plural: string, none = `sem ${plural}`): string {
  if (n === 0) return none;
  return `${n.toLocaleString("pt-BR")} ${n === 1 ? singular : plural}`;
}
