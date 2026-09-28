export type SceneId = 'opening' | 'hall' | 'corridor' | 'gallery' | 'keywords' | 'network' | 'finale';

export const SCENE_ORDER: readonly SceneId[] = ['opening', 'hall', 'corridor', 'gallery', 'keywords', 'network', 'finale'];

export type DurationMode = 'auto' | 30 | 60 | 90 | 120;

export type Resolution = '720p' | '1080p';

export const RESOLUTIONS: Record<Resolution, { width: number; height: number; bitrate: number }> = {
  '720p': { width: 1280, height: 720, bitrate: 6_000_000 },
  '1080p': { width: 1920, height: 1080, bitrate: 12_000_000 },
};

export const FPS = 30;

export type Vec3 = [number, number, number];

export interface SceneSpan {
  id: SceneId;
  start: number;
  end: number;
}

export interface GalleryStop {
  start: number;
  end: number;
  photoIndices: number[];
}

export interface Timeline {
  total: number;
  scenes: SceneSpan[];
  galleryStops: GalleryStop[];
}

export interface ProjectInput {
  photos: File[];
  captions: string[];
  portraitIndex: number;
  name: string;
  subtitle: string;
  date: string;
  keywords: string[];
  durationMode: LengthMode;
  resolution: Resolution;
  musicStyle: MusicStyle;
  music: File | null;
}

export type ShotId =
  | 'title' | 'intro' | 'exhibition' | 'portraits' | 'photos' | 'moments' | 'words'
  | 'likes' | 'videos' | 'robots' | 'mosaic' | 'network' | 'ending';

export const SHOT_ORDER: readonly ShotId[] = [
  'title', 'intro', 'exhibition', 'portraits', 'photos', 'moments', 'words',
  'likes', 'videos', 'robots', 'mosaic', 'network', 'ending',
];

export type LengthMode = 'auto' | 30 | 60 | 90 | 120 | 'music';

export type MusicStyle = 'airy' | 'calm' | 'upload';

export interface ShotSpan {
  id: ShotId;
  start: number;
  end: number;
}

export interface Storyboard {
  total: number;
  shots: ShotSpan[];
}
