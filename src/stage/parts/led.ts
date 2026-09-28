/** LED wall raster: the text mask is cols × rows pixels, each drawn as a dot `dot` px wide. */
export const LED = { cols: 640, rows: 200, dot: 6, mainRows: 9, mainUnits: 70, highlightRows: 4, highlightUnits: 30 } as const;

/** Width in half-em units: CJK and other wide scripts count 2, everything else 1. */
export function textUnits(text: string): number {
  let units = 0;
  for (const ch of text) units += ch.codePointAt(0)! >= 0x2e80 ? 2 : 1;
  return units;
}

/** Rows of repeated words, each at least `unitsPerRow` wide, each starting at a different word. */
export function ledLines(words: string[], rows: number, unitsPerRow: number): string[] {
  const list = words.map((w) => w.trim()).filter(Boolean);
  if (list.length === 0) return Array.from({ length: rows }, () => '');
  return Array.from({ length: rows }, (_, r) => {
    let line = '';
    let i = r % list.length;
    while (textUnits(line) < unitsPerRow) {
      line += (line ? '  ' : '') + list[i];
      i = (i + 1) % list.length;
    }
    return line.toUpperCase();
  });
}

export function ledWords(keywords: string[], name: string, subtitle: string): string[] {
  return keywords.length > 0 ? keywords : [name, ...subtitle.split(/\s+/)].filter(Boolean);
}
