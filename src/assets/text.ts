import { CanvasTexture, SRGBColorSpace, type Texture } from 'three';
import type { TextLine, TextSpec, TextTexture, TextureFactory } from './texture-factory';

export const FONT_STACK = '"Noto Sans TC", "Noto Sans JP", system-ui, sans-serif';
const FONT_WEIGHTS = [300, 500, 700] as const;

/** Loads the Noto Sans TC unicode-range subsets needed for `texts` before canvases are drawn. */
export async function ensureFonts(texts: string[]): Promise<void> {
  const sample = Array.from(new Set(texts.join(''))).join('') || 'A';
  try {
    await Promise.all(FONT_WEIGHTS.map((w) => document.fonts.load(`${w} 32px "Noto Sans TC"`, sample)));
  } catch {
    // Offline or blocked: canvases fall back to the next font in FONT_STACK.
  }
}

const fontOf = (line: TextLine): string => `${line.weight ?? 400} ${line.px}px ${FONT_STACK}`;

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return ctx;
}

function toTexture(canvas: HTMLCanvasElement): CanvasTexture {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

export function createCanvasTextureFactory(): TextureFactory {
  return {
    text(spec: TextSpec): TextTexture {
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
    },

    glow(): Texture {
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
    },
  };
}
