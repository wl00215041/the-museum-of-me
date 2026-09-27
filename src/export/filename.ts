export function exportFilename(name: string, date: Date, extension: string): string {
  const slug = name.trim().replace(/[\\/:*?"<>|%]+/g, '').trim().replace(/\s+/g, '-').slice(0, 40) || 'me';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `museum-of-${slug}-${y}${m}${d}.${extension}`;
}
