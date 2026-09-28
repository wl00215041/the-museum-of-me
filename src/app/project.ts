import { bitmapToTexture, loadHires, loadLibrary } from '../assets/library';
import type { PhotoPool } from '../assets/photo-pool';
import { createCanvasTextureFactory, ensureFonts, rasterizeLines } from '../assets/text';
import { buildSoundtrack, probeAudioDuration } from '../audio/soundtrack';
import { buildShots, type ShotPath } from '../camera/shots';
import { buildStoryboard } from '../plan/storyboard';
import { buildStage, type Stage } from '../stage/build';
import { MOSAIC, computeStageLayout, type StageLayout } from '../stage/layout';
import { LED, ledLines, ledWords } from '../stage/parts/led';
import type { ProjectInput, Storyboard } from '../types';
import { MIN_PHOTOS } from '../ui/validate';
import { exhibitionDate, formatDisplayDate, formatExhibitionStamp } from '../util/format';
import { hashString } from '../util/rng';

export interface Project {
  input: ProjectInput;
  storyboard: Storyboard;
  layout: StageLayout;
  stage: Stage;
  camera: ShotPath;
  soundtrack: AudioBuffer;
  warnings: string[];
  dispose(): void;
}

export async function buildProject(input: ProjectInput, pool: PhotoPool, onStatus: (message: string) => void): Promise<Project> {
  const words = ledWords(input.keywords, input.name, input.subtitle);
  onStatus('載入字型…');
  await ensureFonts([
    'The Museum of Me Create and explore a visual archive of your social life memories.',
    'This exhibition is a journey of visualization that explores who is. EXHIBITION Portraits Photos ■ NO. 0123456789:,APM',
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
    const storyboard = buildStoryboard({ photoCount: library.count, lengthMode: input.durationMode, musicDuration });
    if (musicDuration !== null && Math.abs(musicDuration - storyboard.total) > 0.5) {
      warnings.push(`音樂長度 ${Math.round(musicDuration)} 秒不在 30–300 秒之間，影片長度調整為 ${storyboard.total} 秒`);
    }
    const layout = computeStageLayout({ storyboard, aspects: library.aspects, portraitIndex, seed });

    onStatus('準備展示用的高解析照片…');
    await loadHires(library, input.photos, layout.featured, pool);

    onStatus('計算馬賽克…');
    const colors = await pool.grid(input.photos[library.sourceIndices[portraitIndex]], MOSAIC.cols, MOSAIC.rows);
    const assignment = await pool.mosaic(colors, new Float32Array(library.colors.flat()), seed);

    onStatus('繪製 LED 字牆…');
    const led = async (lines: string[]) =>
      bitmapToTexture(await pool.led(rasterizeLines(lines, LED.cols, LED.rows), LED.cols, LED.rows, LED.dot));
    const main = await led(ledLines(words, LED.mainRows, LED.mainUnits));
    const highlight = await led(ledLines(words.slice(0, 1), LED.highlightRows, LED.highlightUnits));
    cleanup.push(() => {
      main.dispose();
      highlight.dispose();
    });

    onStatus('布置展廳…');
    const stage = buildStage(storyboard, layout, {
      library,
      name: input.name,
      subtitle: input.subtitle,
      stamp: formatExhibitionStamp(exhibitionDate(input.date, new Date())),
      dateLabel: formatDisplayDate(input.date),
      captions,
      led: { main, highlight },
      mosaic: { colors, assignment },
    }, createCanvasTextureFactory());
    cleanup.push(() => stage.dispose());
    const camera = buildShots(storyboard, layout);

    onStatus('合成配樂…');
    const soundtrack = await buildSoundtrack({ style: input.musicStyle, file: input.music }, storyboard.total, seed);
    if (soundtrack.warning) warnings.push(soundtrack.warning);

    return {
      input, storyboard, layout, stage, camera, soundtrack: soundtrack.buffer, warnings,
      dispose() {
        cleanup.reverse().forEach((f) => f());
      },
    };
  } catch (err) {
    cleanup.reverse().forEach((f) => f());
    throw err;
  }
}
