import { registerAacEncoder } from '@mediabunny/aac-encoder';
import {
  AudioBufferSource, BufferTarget, CanvasSource, Mp4OutputFormat, Output, WebMOutputFormat,
  canEncodeAudio, canEncodeVideo, getFirstEncodableVideoCodec, type AudioCodec, type VideoCodec,
} from 'mediabunny';
import { yieldToEventLoop } from './yield';

export const AUDIO_BITRATE = 192_000;

export class ExportUnsupportedError extends Error {
  constructor() {
    super('此瀏覽器無法編碼影片，請改用最新版 Chrome 或 Edge');
    this.name = 'ExportUnsupportedError';
  }
}

export interface ExportFormat {
  container: 'mp4' | 'webm';
  video: VideoCodec;
  audio: AudioCodec;
}

export interface ExportProgress {
  frame: number;
  frames: number;
  etaSeconds: number | null;
}

export interface ExportOptions {
  canvas: HTMLCanvasElement;
  renderFrame: (t: number) => void;
  total: number;
  fps: number;
  width: number;
  height: number;
  bitrate: number;
  audio: AudioBuffer;
  signal: AbortSignal;
  onProgress: (p: ExportProgress) => void;
}

let aacRegistered = false;

export async function pickFormat(
  width: number,
  height: number,
  bitrate: number,
  audio: { sampleRate: number; numberOfChannels: number },
): Promise<ExportFormat | null> {
  const audioOptions = { numberOfChannels: audio.numberOfChannels, sampleRate: audio.sampleRate, bitrate: AUDIO_BITRATE };
  if (await canEncodeVideo('avc', { width, height, bitrate })) {
    if (!aacRegistered && !(await canEncodeAudio('aac', audioOptions))) {
      registerAacEncoder();
      aacRegistered = true;
    }
    return { container: 'mp4', video: 'avc', audio: 'aac' };
  }
  const video = await getFirstEncodableVideoCodec(['vp9', 'vp8'], { width, height, bitrate });
  if (video && (await canEncodeAudio('opus', audioOptions))) return { container: 'webm', video, audio: 'opus' };
  return null;
}

export function sliceAudioBuffer(src: AudioBuffer, start: number, end: number): AudioBuffer {
  const out = new AudioBuffer({ length: end - start, numberOfChannels: src.numberOfChannels, sampleRate: src.sampleRate });
  for (let c = 0; c < src.numberOfChannels; c++) out.copyToChannel(src.getChannelData(c).subarray(start, end), c);
  return out;
}

/** Renders every frame with renderFrame(i / fps) and encodes it with the soundtrack, interleaved per second. */
export async function exportVideo(o: ExportOptions): Promise<{ blob: Blob; extension: 'mp4' | 'webm' }> {
  const format = await pickFormat(o.width, o.height, o.bitrate, o.audio);
  if (!format) throw new ExportUnsupportedError();

  const output = new Output({
    format: format.container === 'mp4' ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(),
    target: new BufferTarget(),
  });
  const video = new CanvasSource(o.canvas, { codec: format.video, bitrate: o.bitrate, keyFrameInterval: 2, sizeChangeBehavior: 'deny' });
  const audio = new AudioBufferSource({ codec: format.audio, bitrate: AUDIO_BITRATE });
  output.addVideoTrack(video, { frameRate: o.fps });
  output.addAudioTrack(audio);
  await output.start();

  const frames = Math.round(o.total * o.fps);
  const chunk = o.audio.sampleRate;
  let audioCursor = 0;
  const addAudioUntil = async (seconds: number) => {
    while (audioCursor < o.audio.length && audioCursor / o.audio.sampleRate <= seconds) {
      const end = Math.min(o.audio.length, audioCursor + chunk);
      await audio.add(sliceAudioBuffer(o.audio, audioCursor, end));
      audioCursor = end;
    }
  };

  const started = performance.now();
  try {
    for (let i = 0; i < frames; i++) {
      o.signal.throwIfAborted();
      const t = i / o.fps;
      await addAudioUntil(t + 1);
      o.renderFrame(t);
      await video.add(t, 1 / o.fps);
      const elapsed = (performance.now() - started) / 1000;
      o.onProgress({ frame: i + 1, frames, etaSeconds: i >= 10 ? (elapsed / (i + 1)) * (frames - i - 1) : null });
      if (i % 10 === 0) await yieldToEventLoop(); // let the UI repaint
    }
    await addAudioUntil(Infinity);
    o.signal.throwIfAborted();
    await output.finalize();
  } catch (err) {
    if (output.state !== 'finalized' && output.state !== 'canceled') await output.cancel().catch(() => undefined);
    throw err;
  }

  const buffer = output.target.buffer;
  if (!buffer) throw new Error('匯出失敗：編碼器沒有產生任何資料');
  return { blob: new Blob([buffer], { type: format.container === 'mp4' ? 'video/mp4' : 'video/webm' }), extension: format.container };
}
