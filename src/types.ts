export type Resolution = '720p' | '1080p';

export const RESOLUTIONS: Record<Resolution, { width: number; height: number; bitrate: number }> = {
  '720p': { width: 1280, height: 720, bitrate: 6_000_000 },
  '1080p': { width: 1920, height: 1080, bitrate: 12_000_000 },
};

export const FPS = 30;

export type Vec3 = [number, number, number];

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

export type LengthMode = 'auto' | 30 | 60 | 90 | 120 | 'music';

export type MusicStyle = 'airy' | 'calm' | 'upload';

export type SegmentId =
  | 'title' | 'exhibition' | 'intro' | 'portraits' | 'photos' | 'moments' | 'words'
  | 'likes' | 'videos' | 'robots' | 'dive' | 'mosaic' | 'network' | 'ending';

export const SEGMENT_ORDER: readonly SegmentId[] = [
  'title', 'exhibition', 'intro', 'portraits', 'photos', 'moments', 'words',
  'likes', 'videos', 'robots', 'dive', 'mosaic', 'network', 'ending',
];

export interface Segment {
  id: SegmentId;
  start: number;
  end: number;
}

export interface Sequence {
  total: number;
  segments: Segment[];
}
