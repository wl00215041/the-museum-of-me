import { describe, expect, it } from 'vitest';
import { ledLines, ledWords, textUnits } from '../../src/stage/parts/led';

describe('led text', () => {
  it('counts CJK characters as two units', () => {
    expect(textUnits('AB')).toBe(2);
    expect(textUnits('你好')).toBe(4);
  });

  it('fills every row past the width, uppercased, starting at different words', () => {
    const rows = ledLines(['travel', 'family', '勇氣'], 5, 40);
    expect(rows).toHaveLength(5);
    for (const row of rows) expect(textUnits(row)).toBeGreaterThanOrEqual(40);
    expect(rows[0]).toBe(rows[0].toUpperCase());
    expect(rows[0].slice(0, 6)).not.toBe(rows[1].slice(0, 6));
  });

  it('returns blank rows when there are no words', () => {
    expect(ledLines([' ', ''], 3, 10)).toEqual(['', '', '']);
  });

  it('falls back to the name and subtitle when there are no keywords', () => {
    expect(ledWords([], '小明', '2026 Graduation')).toEqual(['小明', '2026', 'Graduation']);
    expect(ledWords(['a'], '小明', '')).toEqual(['a']);
  });
});
