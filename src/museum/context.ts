import type { Group } from 'three';
import type { PhotoAsset } from '../assets/photos';
import type { TextureFactory } from '../assets/texture-factory';
import type { SceneSpan } from '../types';
import type { Layout, Room } from './layout';
import type { Materials } from './materials';

export interface MuseumContent {
  photos: PhotoAsset[];
  captions: string[];
  portraitIndex: number;
  name: string;
  subtitle: string;
  /** Already formatted for display, e.g. "2026.09.28". */
  date: string;
  keywords: string[];
}

export interface SceneContext {
  room: Room;
  span: SceneSpan;
  layout: Layout;
  content: MuseumContent;
  tex: TextureFactory;
  mats: Materials;
}

export interface SceneObject {
  group: Group;
  update?: (t: number) => void;
}
