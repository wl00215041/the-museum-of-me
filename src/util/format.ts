export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function formatDisplayDate(value: string): string {
  return value ? value.replaceAll('-', '.') : '';
}

export function truncate(text: string, max: number): string {
  const chars = [...text];
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : text;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const two = (n: number) => String(n).padStart(2, '0');

/** "08:06:55 AM Monday November 28, 2011", as on the original exhibition wall. */
export function formatExhibitionStamp(date: Date): string {
  const h = date.getHours();
  const clock = `${two(h % 12 || 12)}:${two(date.getMinutes())}:${two(date.getSeconds())} ${h < 12 ? 'AM' : 'PM'}`;
  return `${clock} ${WEEKDAYS[date.getDay()]} ${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

/** The form's yyyy-mm-dd date at the current time of day, or now when no date was chosen. */
export function exhibitionDate(value: string, now: Date): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return new Date(now);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), now.getHours(), now.getMinutes(), now.getSeconds());
}
