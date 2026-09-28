import type { Group, Texture } from 'three';
import type { PhotoLibrary } from '../../assets/library';
import type { StageTextureFactory } from '../../assets/texture-factory';
import type { Sequence } from '../../types';
import type { StageMaterials } from '../parts/materials';
import type { Strip } from '../strip';

export interface WorldContent {
  library: PhotoLibrary;
  name: string;
  subtitle: string;
  /** e.g. "08:06:55 AM Monday November 28, 2011" */
  stamp: string;
  /** e.g. "2026.09.28"; empty when no date was chosen. */
  dateLabel: string;
  captions: string[];
  led: { main: Texture; highlight: Texture };
  /** Portrait colour per carpet cell (flat rgb, row 0 at the far edge) and the photo chosen for each cell. */
  mosaic: { colors: Float32Array; assignment: Int32Array };
}

export interface WorldContext {
  sequence: Sequence;
  strip: Strip;
  content: WorldContent;
  tex: StageTextureFactory;
  mats: StageMaterials;
}

export interface RoomObject {
  group: Group;
  update?: (t: number) => void;
}

export function hiresOf(content: WorldContent, index: number): Texture {
  const texture = content.library.hires.get(index);
  if (!texture) throw new Error(`photo ${index} is featured but has no high-resolution texture`);
  return texture;
}
