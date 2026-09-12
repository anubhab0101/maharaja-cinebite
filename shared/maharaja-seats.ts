// Transcribed from the seat-layout screenshot supplied by the cinema operator.
// Ticket prices and grey/green booking availability do not control food prices
// or remove physical seats from this list. Repeated row names need section IDs.
export const MAHARAJA_SECTIONS = [
  { code: "MS", name: "Motorized Slider", rows: { A: 27, B: 22, C: 16, D: 16, E: 16 } },
  { code: "SD", name: "Super Deluxe", rows: { A: 29, B: 29, C: 29, D: 29, E: 29, F: 29, G: 29 } },
  { code: "RC", name: "Recliner", rows: { A: 20, B: 20, C: 20 } },
  { code: "SL", name: "Slider", rows: { A: 28, B: 26, C: 26, D: 26, E: 26, F: 26, G: 22 } },
] as const;

export const MAHARAJA_SEAT_LABELS: string[] = MAHARAJA_SECTIONS.flatMap(section =>
  Object.entries(section.rows).flatMap(([row, count]) =>
    Array.from({ length: count }, (_, i) => `${section.code}-${row}${String(i + 1).padStart(2, "0")}`)
  )
);

export function describeMaharajaSeat(label: string): string {
  const section = MAHARAJA_SECTIONS.find(section => label.startsWith(section.code + "-"));
  return section ? `${section.name} · ${label.slice(section.code.length + 1)}` : label;
}
