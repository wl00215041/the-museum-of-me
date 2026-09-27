import { describe, expect, it } from 'vitest';
import { formatDisplayDate, formatTime, truncate } from '../../src/util/format';
import { clamp, lerp, smoothstep } from '../../src/util/math';
import { hashString, mulberry32 } from '../../src/util/rng';

describe('rng', () => {
  it('mulberry32 is deterministic and stays in [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 200; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('different seeds give different sequences', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  it('hashString is stable FNV-1a', () => {
    expect(hashString('')).toBe(0x811c9dc5);
    expect(hashString('abc')).toBe(hashString('abc'));
    expect(hashString('abc')).not.toBe(hashString('abd'));
  });
});

describe('math', () => {
  it('clamp / lerp / smoothstep', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(lerp(2, 4, 0.5)).toBe(3);
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 2)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBe(0.5);
  });
});

describe('format', () => {
  it('formatTime shows m:ss with floored seconds', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(65.4)).toBe('1:05');
    expect(formatTime(125.9)).toBe('2:05');
  });

  it('formatDisplayDate turns yyyy-mm-dd into yyyy.mm.dd', () => {
    expect(formatDisplayDate('2026-09-28')).toBe('2026.09.28');
    expect(formatDisplayDate('')).toBe('');
  });

  it('truncate counts code points and appends an ellipsis', () => {
    expect(truncate('短句', 5)).toBe('短句');
    expect(truncate('一二三四五六', 4)).toBe('一二三…');
    expect(truncate('😀😀😀', 2)).toBe('😀…');
  });
});
