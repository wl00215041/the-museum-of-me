import type { Texture } from 'three';

export interface TextLine {
  text: string;
  px: number;
  weight?: 300 | 400 | 500 | 700;
  spacing?: number;
  color?: string;
}

export interface TextSpec {
  lines: TextLine[];
  color?: string;
  background?: string;
  padding?: number;
  /** Extra gap between lines, as a fraction of the next line's size. */
  lineGap?: number;
  align?: 'center' | 'left';
  /** Fixed canvas size; otherwise the canvas hugs the text. */
  size?: { width: number; height: number };
}

export interface TextTexture {
  texture: Texture;
  /** Canvas width / height. */
  aspect: number;
}

export interface TextureFactory {
  text(spec: TextSpec): TextTexture;
  glow(): Texture;
}
