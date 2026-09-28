import type { Texture } from 'three';
import { loadPhotos } from '../assets/photos';
import { createCanvasTextureFactory, ensureFonts } from '../assets/text';
import { buildSoundtrack } from '../audio/soundtrack';
import { createCameraPath, type CameraPath } from '../camera/hermite';
import { buildCameraKeys } from '../camera/keys';
import { buildMuseum, type MuseumScene } from '../museum/build';
import { computeLayout, type Layout } from '../museum/layout';
import { buildTimeline } from '../plan/timeline';
import type { ProjectInput, Timeline } from '../types';
import { MIN_PHOTOS } from '../ui/validate';
import { formatDisplayDate } from '../util/format';
import { hashString } from '../util/rng';

export interface Project {
  input: ProjectInput;
  timeline: Timeline;
  layout: Layout;
  museum: MuseumScene;
  camera: CameraPath;
  soundtrack: AudioBuffer;
  endCard: Texture;
  warnings: string[];
  dispose(): void;
}

export async function buildProject(input: ProjectInput, onStatus: (message: string) => void): Promise<Project> {
  onStatus('載入字型…');
  await ensureFonts(['THE MUSEUM OF No.0123456789–', input.name, input.subtitle, input.date, ...input.keywords, ...input.captions]);

  onStatus(`處理照片（${input.photos.length} 張）…`);
  const { photos, failed } = await loadPhotos(input.photos);
  const warnings: string[] = [];
  if (failed.length > 0) warnings.push(`無法讀取 ${failed.length} 張照片，已略過：${failed.join('、')}`);
  if (photos.length < MIN_PHOTOS) {
    photos.forEach((p) => p.texture.dispose());
    const detail = failed.length > 0 ? `（無法讀取：${failed.join('、')}）` : '';
    throw new Error(`可用的照片不足 ${MIN_PHOTOS} 張${detail}`);
  }
  const captions = photos.map((p) => input.captions[p.sourceIndex] ?? '');
  const portraitIndex = Math.max(0, photos.findIndex((p) => p.sourceIndex === input.portraitIndex));
  const seed = hashString([input.name, ...input.keywords, String(photos.length)].join('|'));

  onStatus('布置展廳…');
  const timeline = buildTimeline({ photoCount: photos.length, durationMode: input.durationMode === 'music' ? 'auto' : input.durationMode, hasKeywords: input.keywords.length > 0 });
  const layout = computeLayout({ timeline, aspects: photos.map((p) => p.aspect), portraitIndex, keywords: input.keywords, seed });
  const tex = createCanvasTextureFactory();
  const date = formatDisplayDate(input.date);
  const museum = buildMuseum(timeline, layout, {
    photos, captions, portraitIndex, name: input.name, subtitle: input.subtitle, date, keywords: input.keywords,
  }, tex);
  const camera = createCameraPath(buildCameraKeys(timeline, layout));
  const endCard = tex.text({
    size: { width: 1920, height: 1080 },
    lines: [
      { text: 'THE MUSEUM OF', px: 44, weight: 300, spacing: 14 },
      { text: input.name, px: 120, weight: 700, spacing: 4 },
      { text: input.subtitle, px: 40, weight: 300, spacing: 4 },
      { text: date, px: 32, weight: 300, spacing: 6, color: '#6e6e73' },
    ],
  }).texture;

  onStatus('合成配樂…');
  const soundtrack = await buildSoundtrack({ style: input.musicStyle, file: input.music }, timeline.total, seed);
  if (soundtrack.warning) warnings.push(soundtrack.warning);

  return {
    input, timeline, layout, museum, camera, soundtrack: soundtrack.buffer, endCard, warnings,
    dispose() {
      museum.dispose();
      photos.forEach((p) => p.texture.dispose());
      endCard.dispose();
    },
  };
}
