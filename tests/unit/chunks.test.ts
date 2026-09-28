import { describe, expect, it } from 'vitest';
import { applyMaster, chunkNotes, overlapAdd } from '../../src/audio/chunks';
import type { NoteEvent } from '../../src/audio/score';

const note = (time: number): NoteEvent => ({ time, midi: 60, velocity: 0.5, duration: 1, voice: 'piano' });

describe('chunkNotes', () => {
  it('puts every note in exactly one chunk, by start time', () => {
    const events = [0, 3, 15.99, 16, 31, 40].map(note);
    const chunks = chunkNotes(events, 41, 16);
    expect(chunks.map((c) => [c.start, c.end])).toEqual([[0, 16], [16, 32], [32, 41]]);
    expect(chunks.map((c) => c.events.map((e) => e.time))).toEqual([[0, 3, 15.99], [16, 31], [40]]);
  });

  it('always returns at least one chunk', () => {
    expect(chunkNotes([], 5, 16)).toEqual([{ start: 0, end: 5, events: [] }]);
  });
});

describe('overlapAdd', () => {
  it('adds into the destination and clips at its end', () => {
    const dst = new Float32Array([1, 1, 1, 1]);
    overlapAdd(dst, new Float32Array([1, 2, 3]), 2);
    expect(Array.from(dst)).toEqual([1, 1, 2, 3]);
  });
});

describe('applyMaster', () => {
  it('fades in from silence, fades out to silence and keeps peaks below 1', () => {
    const sr = 1000;
    const ch = new Float32Array(10 * sr).fill(2);
    applyMaster([ch], sr, 0.5, 3, 0.8);
    expect(ch[0]).toBe(0);
    expect(ch[ch.length - 1]).toBeCloseTo(0, 6);
    expect(Math.max(...ch)).toBeLessThan(1);
    expect(ch[5 * sr]).toBeGreaterThan(0.9);
  });
});
