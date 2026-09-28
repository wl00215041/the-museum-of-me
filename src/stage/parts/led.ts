import { TRACK } from '../../camera/track';
/** LED wall raster: the text mask is cols × rows pixels, each drawn as a dot `dot` px wide. */
export const LED = { cols: 640, rows: 200, dot: 6, mainRows: 14, mainUnits: 100, highlightRows: 4, highlightUnits: 30 } as const;

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

/** v4 LED wall (spec v4 §5): each phase is one texture of rows, twice as wide as the visible window, so rows can scroll. */
export const LED_V4 = {
  cols: 1280,
  rows: 192,
  dot: 3,
  /** Fraction of a row texture visible at once. */
  window: 0.5,
  /** Scroll speed in half-em units per second (estimated from the original). */
  scroll: 1.5,
  phases: { small: { rows: 14, units: 200 }, large: { rows: 8, units: 114 }, full: { rows: 4, units: 58 } },
  highlight: { cols: 320, rows: 96 },
} as const;

export type LedPhase = 'small' | 'large' | 'highlight' | 'full';

/** What the LED screen shows at fraction `u` of the Words segment (the screen changes its own content, original 75–86 s). */
export function ledPhaseAt(u: number): LedPhase {
  const [a, b, c, d] = TRACK.words.switches;
  return u < a ? 'small' : u < b ? 'large' : u < c ? 'highlight' : u < d ? 'full' : 'small';
}

/** Texture offset of LED row `row`, `seconds` into its phase: even rows move the text left, odd rows right. */
export function ledRowOffset(row: number, seconds: number, units: number): number {
  const travel = Math.min(1 - LED_V4.window, (LED_V4.scroll * Math.max(0, seconds)) / units);
  return row % 2 === 0 ? travel : 1 - LED_V4.window - travel;
}
