import { bitmapToTexture, loadHires, loadLibrary } from '../assets/library';
import type { PhotoPool } from '../assets/photo-pool';
import { createCanvasTextureFactory, ensureFonts, rasterizeHighlight, rasterizeLines } from '../assets/text';
import { buildSoundtrack, probeAudioDuration } from '../audio/soundtrack';
import { buildGalleryPath, type CameraPath } from '../camera/gallery-path';
import { buildSequence } from '../plan/sequence';
import { CARPET, computeGallery, type Gallery } from '../stage/gallery';
import { buildGalleryWorld, type GalleryWorld } from '../stage/gallery/world';
import { LED_V4, ledLines, ledWords } from '../stage/parts/led';
import type { ProjectInput, Sequence } from '../types';
import { MIN_PHOTOS } from '../ui/validate';
import { exhibitionDate, formatDisplayDate, formatExhibitionStamp } from '../util/format';
import { hashString } from '../util/rng';

export interface Project {
  input: ProjectInput;
  sequence: Sequence;
  gallery: Gallery;
  world: GalleryWorld;
  camera: CameraPath;
  soundtrack: AudioBuffer;
  warnings: string[];
  dispose(): void;
}

export async function buildProject(input: ProjectInput, pool: PhotoPool, onStatus: (message: string) => void): Promise<Project> {
  const words = ledWords(input.keywords, input.name, input.subtitle);
  onStatus('載入字型…');
  await ensureFonts([
    'The Museum of Me Create and explore a visual archive of your social life memories.',
    'This exhibition is a journey of visualization that explores who is. EXHIBITION ■ NO. 0123456789:,.APM',
    'Friends Photos Location Words Likes Videos The faces in this collection. Moments worth keeping. Where and when.',
    input.name, input.name.toUpperCase(), input.subtitle, ...words, ...words.map((w) => w.toUpperCase()), ...input.captions,
  ]);

  let musicDuration: number | null = null;
  if (input.durationMode === 'music') {
    if (!input.music) throw new Error('「配合音樂長度」需要先上傳音樂檔');
    try {
      musicDuration = await probeAudioDuration(input.music);
    } catch {
      throw new Error(`無法讀取音樂檔「${input.music.name}」，無法配合音樂長度`);
    }
  }

  onStatus(`處理照片 0 / ${input.photos.length}`);
  const { library, failed } = await loadLibrary(input.photos, pool, (done, total) => onStatus(`處理照片 ${done} / ${total}`));
  const cleanup: (() => void)[] = [() => library.dispose()];
  try {
    const warnings: string[] = [];
    if (failed.length > 0) warnings.push(`無法讀取 ${failed.length} 張照片，已略過：${failed.slice(0, 10).join('、')}${failed.length > 10 ? '…' : ''}`);
    if (library.count < MIN_PHOTOS) throw new Error(`可用的照片不足 ${MIN_PHOTOS} 張${failed.length ? `（無法讀取 ${failed.length} 張）` : ''}`);

    const captions = library.sourceIndices.map((i) => input.captions[i] ?? '');
    const portraitIndex = Math.max(0, library.sourceIndices.indexOf(input.portraitIndex));
    const seed = hashString([input.name, ...input.keywords, String(library.count)].join('|'));
    const sequence = buildSequence({ photoCount: library.count, lengthMode: input.durationMode, musicDuration });
    if (musicDuration !== null && Math.abs(musicDuration - sequence.total) > 0.5) {
      warnings.push(`音樂長度 ${Math.round(musicDuration)} 秒不在 30–300 秒之間，影片長度調整為 ${sequence.total} 秒`);
    }
    // Synthesis runs alongside the photo work below (review Important #2).
    const soundtrackPromise = buildSoundtrack({ style: input.musicStyle, file: input.music }, sequence.total, seed);
    soundtrackPromise.catch(() => undefined);
    const gallery = computeGallery({ sequence, aspects: library.aspects, portraitIndex, seed });

    onStatus('準備展示用的高解析照片…');
    await loadHires(library, input.photos, gallery.featured, pool);

    onStatus('計算馬賽克…');
    const colors = await pool.grid(input.photos[library.sourceIndices[portraitIndex]], CARPET.cols, CARPET.rows);
    const assignment = await pool.mosaic(colors, new Float32Array(library.colors.flat()), seed);

    onStatus('繪製 LED 字牆…');
    const { cols, rows, dot, phases, highlight: hl } = LED_V4;
    const ledTexture = async (lines: string[]) => bitmapToTexture(await pool.led(rasterizeLines(lines, cols, rows), cols, rows, dot));
    const small = await ledTexture(ledLines(words, phases.small.rows, phases.small.units));
    const large = await ledTexture(ledLines(words, phases.large.rows, phases.large.units));
    const full = await ledTexture(ledLines(words.slice(0, 1), phases.full.rows, phases.full.units));
    const highlight = bitmapToTexture(await pool.led(rasterizeHighlight(words[0] ?? input.name, hl.cols, hl.rows), hl.cols, hl.rows, dot));
    cleanup.push(() => {
      for (const t of [small, large, full, highlight]) t.dispose();
    });

    onStatus('布置展廳…');
    const world = buildGalleryWorld(sequence, gallery, {
      library,
      name: input.name,
      subtitle: input.subtitle,
      stamp: formatExhibitionStamp(exhibitionDate(input.date, new Date())),
      dateLabel: formatDisplayDate(input.date),
      captions,
      led: { small, large, full, highlight },
      mosaic: { colors, assignment },
    }, createCanvasTextureFactory());
    cleanup.push(() => world.dispose());
    const camera = buildGalleryPath(sequence, gallery);

    onStatus('合成配樂…');
    const soundtrack = await soundtrackPromise;
    if (soundtrack.warning) warnings.push(soundtrack.warning);

    return {
      input, sequence, gallery, world, camera, soundtrack: soundtrack.buffer, warnings,
      dispose() {
        cleanup.reverse().forEach((f) => f());
      },
    };
  } catch (err) {
    cleanup.reverse().forEach((f) => f());
    throw err;
  }
}
