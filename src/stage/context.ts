import type { Scene, Texture } from 'three';
import type { PhotoLibrary } from '../assets/library';
import type { StageTextureFactory } from '../assets/texture-factory';
import type { ShotId, ShotSpan, Storyboard } from '../types';
import { clamp } from '../util/math';
import type { StageLayout } from './layout';
import type { StageMaterials } from './parts/materials';

export interface StageContent {
  library: PhotoLibrary;
  name: string;
  subtitle: string;
  /** e.g. "08:06:55 AM Monday November 28, 2011" */
  stamp: string;
  /** e.g. "2026.09.28"; empty when no date was chosen. */
  dateLabel: string;
  captions: string[];
  led: { main: Texture; highlight: Texture };
  /** Portrait colour per mosaic cell (flat rgb, row 0 at the top) and the photo chosen for each cell. */
  mosaic: { colors: Float32Array; assignment: Int32Array };
}

export interface SetContext {
  storyboard: Storyboard;
  layout: StageLayout;
  content: StageContent;
  tex: StageTextureFactory;
  mats: StageMaterials;
}

export interface StageSet {
  ids: ShotId[];
  scene: Scene;
  /** Dark rooms get stronger bloom and softer AO. */
  dark: boolean;
  update(t: number): void;
  dispose(): void;
}

export function spanOf(storyboard: Storyboard, id: ShotId): ShotSpan {
  const span = storyboard.shots.find((s) => s.id === id);
  if (!span) throw new Error(`storyboard has no "${id}" shot`);
  return span;
}

export const localU = (span: ShotSpan, t: number): number => clamp((t - span.start) / (span.end - span.start), 0, 1);

export function hiresOf(content: StageContent, index: number): Texture {
  const texture = content.library.hires.get(index);
  if (!texture) throw new Error(`photo ${index} is featured but has no high-resolution texture`);
  return texture;
}
