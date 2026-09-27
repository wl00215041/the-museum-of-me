import { describe, expect, it } from 'vitest';
import { capPhotos, isImageFile, parseDuration, parseKeywords, validateSetup } from '../../src/ui/validate';

describe('parseKeywords', () => {
  it('splits on half- and full-width separators, trims and removes duplicates', () => {
    expect(parseKeywords('勇氣，旅行、 family ,勇氣\n2026;;')).toEqual(['勇氣', '旅行', 'family', '2026']);
  });

  it('caps the list at 40 keywords', () => {
    expect(parseKeywords(Array.from({ length: 50 }, (_, i) => `k${i}`).join(','))).toHaveLength(40);
  });

  it('returns an empty list for blank input', () => {
    expect(parseKeywords('  \n , ')).toEqual([]);
  });
});

describe('capPhotos', () => {
  it('keeps as many files as there is room for and counts the rest', () => {
    expect(capPhotos([1, 2, 3, 4], 3)).toEqual({ kept: [1, 2, 3], dropped: 1 });
    expect(capPhotos([1, 2], 5)).toEqual({ kept: [1, 2], dropped: 0 });
    expect(capPhotos([1, 2], -1)).toEqual({ kept: [], dropped: 2 });
  });
});

describe('validateSetup', () => {
  it('requires 3 photos and a non-blank name', () => {
    expect(validateSetup({ photoCount: 2, name: ' ' })).toEqual(['請至少選擇 3 張照片（目前 2 張）', '請輸入主角名字']);
    expect(validateSetup({ photoCount: 3, name: '小明' })).toEqual([]);
  });
});

describe('parseDuration', () => {
  it('maps select values to duration modes', () => {
    expect(parseDuration('auto')).toBe('auto');
    expect(parseDuration('90')).toBe(90);
    expect(() => parseDuration('45')).toThrow();
  });
});

describe('isImageFile', () => {
  it('accepts image MIME types and known image extensions', () => {
    expect(isImageFile({ type: 'image/jpeg', name: 'a.jpg' })).toBe(true);
    expect(isImageFile({ type: '', name: 'IMG_0001.HEIC' })).toBe(true);
    expect(isImageFile({ type: 'text/plain', name: 'notes.txt' })).toBe(false);
  });
});
