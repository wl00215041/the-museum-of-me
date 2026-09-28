import { describe, expect, it } from 'vitest';
import { TAIL, composeScore } from '../../src/audio/score';

describe('composeScore', () => {
  it('is deterministic for the same seed and differs across seeds', () => {
    expect(composeScore(60, 5)).toEqual(composeScore(60, 5));
    expect(composeScore(60, 5)).not.toEqual(composeScore(60, 6));
  });

  it('keeps every note inside the playable window and a sane range', () => {
    const notes = composeScore(90, 1);
    expect(notes.length).toBeGreaterThan(50);
    for (const n of notes) {
      expect(n.time).toBeGreaterThanOrEqual(0);
      expect(n.time).toBeLessThan(90 - TAIL);
      expect(n.midi).toBeGreaterThanOrEqual(36);
      expect(n.midi).toBeLessThanOrEqual(96);
      expect(n.velocity).toBeGreaterThan(0);
      expect(n.velocity).toBeLessThanOrEqual(1);
      expect(n.duration).toBeGreaterThan(0);
    }
  });

  it('is sorted by time and contains both voices', () => {
    const notes = composeScore(30, 2);
    for (let i = 1; i < notes.length; i++) expect(notes[i].time).toBeGreaterThanOrEqual(notes[i - 1].time);
    expect(new Set(notes.map((n) => n.voice))).toEqual(new Set(['piano', 'pad']));
  });

  it('returns no notes when the video is shorter than the tail', () => {
    expect(composeScore(2, 1)).toEqual([]);
  });
});

import { composeAiryScore } from '../../src/audio/score';

describe('composeAiryScore', () => {
  it('is deterministic, stays inside the window and rings bells over piano and pads', () => {
    const notes = composeAiryScore(80, 3);
    expect(notes).toEqual(composeAiryScore(80, 3));
    expect(new Set(notes.map((n) => n.voice))).toEqual(new Set(['piano', 'pad', 'bell']));
    for (const n of notes) {
      expect(n.time).toBeGreaterThanOrEqual(0);
      expect(n.time).toBeLessThan(80 - TAIL);
    }
    for (let i = 1; i < notes.length; i++) expect(notes[i].time).toBeGreaterThanOrEqual(notes[i - 1].time);
  });

  it('is sparser than the calm score', () => {
    expect(composeAiryScore(120, 1).length).toBeLessThan(composeScore(120, 1).length);
  });
});
