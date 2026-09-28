import type { Texture } from 'three';

export type FontFamily = 'sans' | 'serif' | 'grotesk';

export interface TextLine {
  text: string;
  px: number;
  weight?: 300 | 400 | 500 | 700 | 800;
  spacing?: number;
  color?: string;
  family?: FontFamily;
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

export type ImageLike = CanvasImageSource & { width: number; height: number };

export interface StageTextureFactory extends TextureFactory {
  /** A tall light-box face: the photo, darkened, with coordinate-style captions at the top. */
  lightbox(image: ImageLike, lines: string[]): Texture;
  /** SMPTE-style colour bars for the monitor wall. */
  colorBars(): Texture;
  /** Seamless grey concrete for gallery floors. */
  concrete(): Texture;
}
