import { clamp } from '../util/math';

export interface Player {
  play(): void;
  pause(): void;
  toggle(): void;
  seek(t: number): void;
  readonly time: number;
  readonly playing: boolean;
  dispose(): void;
}

export interface PlayerOptions {
  render: (t: number) => void;
  audio: AudioBuffer;
  total: number;
  onTick: (t: number, playing: boolean) => void;
}

/** Plays the soundtrack through an AudioContext and renders frames on its clock. */
export function createPlayer(o: PlayerOptions): Player {
  const ctx = new AudioContext({ sampleRate: o.audio.sampleRate });
  let source: AudioBufferSourceNode | null = null;
  let offset = 0;
  let startedAt = 0;
  let playing = false;
  let raf = 0;

  const now = (): number => (playing ? Math.min(o.total, ctx.currentTime - startedAt) : offset);

  function stopSource(): void {
    if (!source) return;
    source.stop();
    source.disconnect();
    source = null;
  }

  function frame(): void {
    const t = now();
    o.render(t);
    if (playing && t >= o.total) {
      pause();
      return;
    }
    o.onTick(t, playing);
    if (playing) raf = requestAnimationFrame(frame);
  }

  function play(): void {
    if (playing) return;
    if (offset >= o.total - 0.05) offset = 0;
    void ctx.resume();
    source = ctx.createBufferSource();
    source.buffer = o.audio;
    source.connect(ctx.destination);
    source.start(0, offset);
    startedAt = ctx.currentTime - offset;
    playing = true;
    raf = requestAnimationFrame(frame);
  }

  function pause(): void {
    if (!playing) return;
    offset = now();
    playing = false;
    cancelAnimationFrame(raf);
    stopSource();
    o.onTick(offset, false);
  }

  function seek(t: number): void {
    const resume = playing;
    if (resume) pause();
    offset = clamp(t, 0, o.total);
    o.render(offset);
    o.onTick(offset, false);
    if (resume) play();
  }

  return {
    play,
    pause,
    toggle: () => (playing ? pause() : play()),
    seek,
    get time() { return now(); },
    get playing() { return playing; },
    dispose() {
      pause();
      void ctx.close();
    },
  };
}
