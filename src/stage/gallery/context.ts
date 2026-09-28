import type { Group, Texture } from 'three';
import type { PhotoLibrary } from '../../assets/library';
import type { StageTextureFactory } from '../../assets/texture-factory';
import type { Sequence } from '../../types';
import type { Gallery } from '../gallery';
import type { StageMaterials } from '../parts/materials';

export interface GalleryContent {
  library: PhotoLibrary;
  name: string;
  subtitle: string;
  /** e.g. "08:06:55 AM Monday November 28, 2011" */
  stamp: string;
  /** e.g. "2026.09.28"; empty when no date was chosen. */
  dateLabel: string;
  captions: string[];
  /** LED wall rows for each phase (spec v4 §5) and the highlighted word. */
  led: { small: Texture; large: Texture; full: Texture; highlight: Texture };
  /** Portrait colour per carpet cell (flat rgb, row 0 at the far edge) and the photo chosen for each cell. */
  mosaic: { colors: Float32Array; assignment: Int32Array };
}

export interface GalleryContext {
  sequence: Sequence;
  gallery: Gallery;
  content: GalleryContent;
  tex: StageTextureFactory;
  mats: StageMaterials;
}

export interface RoomObject {
  group: Group;
  update?: (t: number) => void;
  /** Releases what is not in the scene graph (materials swapped in over time). */
  dispose?: () => void;
}

export function hiresOf(content: GalleryContent, index: number): Texture {
  const texture = content.library.hires.get(index);
  if (!texture) throw new Error(`photo ${index} is featured but has no high-resolution texture`);
  return texture;
}
