import { CanvasTexture, SRGBColorSpace, type Texture } from 'three';
import type { FontFamily, ImageLike, StageTextureFactory, TextLine, TextSpec, TextTexture } from './texture-factory';

export const FONT_STACK = '"Noto Sans TC", "Noto Sans JP", system-ui, sans-serif';

export const FAMILY_STACKS: Record<FontFamily, string> = {
  sans: FONT_STACK,
  serif: `"Bodoni Moda", "Noto Serif TC", ${FONT_STACK}`,
  grotesk: `"Archivo", ${FONT_STACK}`,
};

const FONT_FACES = [
  '300 32px "Noto Sans TC"', '500 32px "Noto Sans TC"', '700 32px "Noto Sans TC"',
  '400 32px "Bodoni Moda"', '500 32px "Bodoni Moda"', '500 32px "Archivo"', '800 32px "Archivo"',
];

/** Loads every family (and the unicode-range subsets `texts` needs) before canvases are drawn. */
export async function ensureFonts(texts: string[]): Promise<void> {
  const sample = Array.from(new Set(texts.join(''))).join('') || 'A';
  try {
    await Promise.all(FONT_FACES.map((face) => document.fonts.load(face, sample)));
  } catch {
    // Offline or blocked: canvases fall back through the family stacks.
  }
}

const fontOf = (line: TextLine): string => `${line.weight ?? 400} ${line.px}px ${FAMILY_STACKS[line.family ?? 'sans']}`;

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  if (!ctx) throw new Error('2D canvas unavailable');
  return ctx;
}

function toTexture(canvas: HTMLCanvasElement): CanvasTexture {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function text(spec: TextSpec): TextTexture {
  const lines = spec.lines.filter((l) => l.text.trim() !== '');
  const padding = spec.padding ?? 40;
  const gap = spec.lineGap ?? 0.35;
  const canvas = document.createElement('canvas');
  const ctx = context2d(canvas);
  const widths = lines.map((l) => {
    ctx.font = fontOf(l);
    ctx.letterSpacing = `${l.spacing ?? 0}px`;
    return ctx.measureText(l.text).width;
  });
  const contentW = Math.max(1, ...widths);
  const contentH = lines.reduce((sum, l, i) => sum + l.px * (i === 0 ? 1 : 1 + gap), 0) || 1;
  canvas.width = spec.size?.width ?? Math.ceil(contentW + padding * 2);
  canvas.height = spec.size?.height ?? Math.ceil(contentH + padding * 2);
  // Resizing resets the context state, so styles are applied after sizing.
  if (spec.background) {
    ctx.fillStyle = spec.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  const align = spec.align ?? 'center';
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  const x = align === 'center' ? canvas.width / 2 : padding;
  let y = (canvas.height - contentH) / 2;
  lines.forEach((l, i) => {
    if (i > 0) y += l.px * gap;
    ctx.font = fontOf(l);
    ctx.letterSpacing = `${l.spacing ?? 0}px`;
    ctx.fillStyle = l.color ?? spec.color ?? '#1d1d1f';
    ctx.fillText(l.text, x, y);
    y += l.px;
  });
  return { texture: toTexture(canvas), aspect: canvas.width / canvas.height };
}

function glow(): Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = context2d(canvas);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255, 248, 235, 1)');
  g.addColorStop(0.5, 'rgba(255, 248, 235, 0.35)');
  g.addColorStop(1, 'rgba(255, 248, 235, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return toTexture(canvas);
}

function lightbox(image: ImageLike, lines: string[]): Texture {
  const W = 520;
  const H = 1120;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = context2d(canvas);
  const scale = Math.max(W / image.width, H / image.height);
  const dw = image.width * scale;
  const dh = image.height * scale;
  ctx.drawImage(image, (W - dw) / 2, (H - dh) / 2, dw, dh);
  const shade = ctx.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
  shade.addColorStop(0.45, 'rgba(0, 0, 0, 0.15)');
  shade.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  lines.filter((l) => l.trim() !== '').forEach((line, i) => {
    ctx.font = `${i === 0 ? 800 : 500} ${i === 0 ? 40 : 28}px ${FAMILY_STACKS.grotesk}`;
    ctx.letterSpacing = i === 0 ? '4px' : '2px';
    ctx.fillText(line, W / 2, i === 0 ? 90 : 150 + (i - 1) * 42);
  });
  return toTexture(canvas);
}

function colorBars(): Texture {
  const W = 640;
  const H = 480;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = context2d(canvas);
  const top = ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0'];
  const middle = ['#0000c0', '#131313', '#c000c0', '#131313', '#00c0c0', '#131313', '#c0c0c0'];
  const bottom = ['#00214c', '#ffffff', '#32006a', '#131313'];
  const bar = W / top.length;
  top.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(i * bar, 0, bar + 1, H * 0.67); });
  middle.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(i * bar, H * 0.67, bar + 1, H * 0.08); });
  const block = W / bottom.length;
  bottom.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(i * block, H * 0.75, block + 1, H * 0.25); });
  return toTexture(canvas);
}

/** Draws lines of text into a cols × rows mask (255 = lit) for the LED wall. */
export function rasterizeLines(lines: string[], cols: number, rows: number, family: FontFamily = 'grotesk', weight = 800): Uint8Array {
  const canvas = document.createElement('canvas');
  canvas.width = cols;
  canvas.height = rows;
  const ctx = context2d(canvas);
  const rowHeight = rows / Math.max(1, lines.length);
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.font = `${weight} ${Math.floor(rowHeight * 0.8)}px ${FAMILY_STACKS[family]}`;
  ctx.letterSpacing = '1px';
  lines.forEach((line, i) => ctx.fillText(line, 1, (i + 0.5) * rowHeight));
  const data = ctx.getImageData(0, 0, cols, rows).data;
  const mask = new Uint8Array(cols * rows);
  for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3] > 110 ? 255 : 0;
  return mask;
}

export function createCanvasTextureFactory(): StageTextureFactory {
  return { text, glow, lightbox, colorBars };
}
