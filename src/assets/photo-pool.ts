import { clamp } from '../util/math';
import type { WorkerJob, WorkerRequest, WorkerResponse, WorkerResult } from './worker-protocol';

export interface ThumbResult {
  bitmap: ImageBitmap;
  aspect: number;
  color: [number, number, number];
}

export interface PhotoPool {
  readonly size: number;
  thumb(file: Blob, maxEdge: number): Promise<ThumbResult>;
  hires(file: Blob, maxEdge: number): Promise<ImageBitmap>;
  grid(file: Blob, cols: number, rows: number): Promise<Float32Array>;
  /** Transfers (and so consumes) the thumbnails. */
  atlas(thumbs: ImageBitmap[], aspects: number[]): Promise<ImageBitmap>;
  led(mask: Uint8Array, cols: number, rows: number, dot: number): Promise<ImageBitmap>;
  mosaic(cells: Float32Array, photos: Float32Array, seed: number): Promise<Int32Array>;
  /** Terminates the workers and rejects every queued or running job. */
  dispose(): void;
}

interface Slot {
  worker: Worker;
  busy: number;
}

interface Job {
  request: WorkerRequest;
  transfer: Transferable[];
  slot: Slot | null;
  resolve(result: WorkerResult): void;
  reject(error: Error): void;
}

const MAX_IN_FLIGHT = 2;

export const defaultPoolSize = (): number => clamp((navigator.hardwareConcurrency || 4) - 1, 2, 6);

export function createPhotoPool(size = defaultPoolSize()): PhotoPool {
  const slots: Slot[] = Array.from({ length: size }, () => ({
    worker: new Worker(new URL('./photo-worker.ts', import.meta.url), { type: 'module' }),
    busy: 0,
  }));
  const running = new Map<number, Job>();
  const queue: Job[] = [];
  let nextId = 1;
  let disposed = false;

  function pump(): void {
    while (queue.length > 0) {
      const slot = slots.reduce((a, b) => (b.busy < a.busy ? b : a));
      if (slot.busy >= MAX_IN_FLIGHT) return;
      const job = queue.shift()!;
      job.slot = slot;
      slot.busy++;
      running.set(job.request.id, job);
      slot.worker.postMessage(job.request, job.transfer);
    }
  }

  for (const slot of slots) {
    slot.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const res = event.data;
      const job = running.get(res.id);
      slot.busy = Math.max(0, slot.busy - 1);
      if (job) {
        running.delete(res.id);
        if (res.ok) job.resolve(res.result);
        else job.reject(new Error(res.error));
      }
      pump();
    };
    slot.worker.onerror = (event) => {
      event.preventDefault();
      const error = new Error(`photo worker failed: ${event.message}`);
      for (const [id, job] of running) {
        if (job.slot !== slot) continue;
        running.delete(id);
        job.reject(error);
      }
      slot.busy = 0;
      pump();
    };
  }

  function run(body: WorkerJob, transfer: Transferable[] = []): Promise<WorkerResult> {
    if (disposed) return Promise.reject(new Error('photo pool disposed'));
    return new Promise((resolve, reject) => {
      queue.push({ request: { ...body, id: nextId++ } as WorkerRequest, transfer, slot: null, resolve, reject });
      pump();
    });
  }

  const ofType = <T extends WorkerResult['type']>(type: T) => (r: WorkerResult): Extract<WorkerResult, { type: T }> => {
    if (r.type !== type) throw new Error(`expected a ${type} result, got ${r.type}`);
    return r as Extract<WorkerResult, { type: T }>;
  };

  return {
    size,
    thumb: (file, maxEdge) => run({ type: 'thumb', file, maxEdge }).then(ofType('thumb')),
    hires: (file, maxEdge) => run({ type: 'hires', file, maxEdge }).then(ofType('hires')).then((r) => r.bitmap),
    grid: (file, cols, rows) => run({ type: 'grid', file, cols, rows }).then(ofType('grid')).then((r) => r.colors),
    atlas: (thumbs, aspects) => run({ type: 'atlas', thumbs, aspects }, thumbs).then(ofType('atlas')).then((r) => r.bitmap),
    led: (mask, cols, rows, dot) => run({ type: 'led', mask, cols, rows, dot }).then(ofType('led')).then((r) => r.bitmap),
    mosaic: (cells, photos, seed) => run({ type: 'mosaic', cells, photos, seed }).then(ofType('mosaic')).then((r) => r.assignment),
    dispose() {
      if (disposed) return;
      disposed = true;
      slots.forEach((s) => s.worker.terminate());
      const error = new Error('photo pool disposed');
      [...running.values(), ...queue].forEach((job) => job.reject(error));
      running.clear();
      queue.length = 0;
    },
  };
}
