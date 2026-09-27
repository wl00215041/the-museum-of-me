import { describe, expect, it } from 'vitest';
import { exportFilename } from '../../src/export/filename';

describe('exportFilename', () => {
  it('keeps CJK names and appends the date as yyyymmdd', () => {
    expect(exportFilename('小明', new Date(2026, 8, 28), 'mp4')).toBe('museum-of-小明-20260928.mp4');
  });

  it('turns whitespace into dashes and strips characters that are illegal in file names', () => {
    expect(exportFilename('  Amy / Lee: "2026" ', new Date(2026, 0, 5), 'webm')).toBe('museum-of-Amy-Lee-2026-20260105.webm');
  });

  it('falls back to "me" when nothing usable is left', () => {
    expect(exportFilename(' /// ', new Date(2026, 0, 5), 'mp4')).toBe('museum-of-me-20260105.mp4');
  });
});
