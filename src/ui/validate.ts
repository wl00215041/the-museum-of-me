import type { LengthMode, MusicStyle } from '../types';

export const MIN_PHOTOS = 3;
export const MAX_PHOTOS = 500;
export const MAX_KEYWORDS = 40;

export function parseKeywords(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,，、;；\n\r]+/)) {
    const word = part.trim();
    if (!word || seen.has(word)) continue;
    seen.add(word);
    out.push(word);
    if (out.length === MAX_KEYWORDS) break;
  }
  return out;
}

export function capPhotos<T>(files: T[], room: number): { kept: T[]; dropped: number } {
  const n = Math.max(0, room);
  return { kept: files.slice(0, n), dropped: Math.max(0, files.length - n) };
}

export function validateSetup(state: { photoCount: number; name: string }): string[] {
  const problems: string[] = [];
  if (state.photoCount < MIN_PHOTOS) problems.push(`請至少選擇 ${MIN_PHOTOS} 張照片（目前 ${state.photoCount} 張）`);
  if (!state.name.trim()) problems.push('請輸入主角名字');
  return problems;
}

export function parseDuration(value: string): LengthMode {
  if (value === 'auto' || value === 'music') return value;
  const n = Number(value);
  if (n === 30 || n === 60 || n === 90 || n === 120) return n;
  throw new Error(`unknown duration option: ${value}`);
}

export function parseMusicStyle(value: string): MusicStyle {
  if (value === 'airy' || value === 'calm' || value === 'upload') return value;
  throw new Error(`unknown music style: ${value}`);
}

export function isImageFile(file: { type: string; name: string }): boolean {
  return file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|avif|heic|heif)$/i.test(file.name);
}
