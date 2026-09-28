export type WorkerRequest =
  | { id: number; type: 'thumb'; file: Blob; maxEdge: number }
  | { id: number; type: 'hires'; file: Blob; maxEdge: number }
  | { id: number; type: 'grid'; file: Blob; cols: number; rows: number }
  | { id: number; type: 'atlas'; thumbs: ImageBitmap[]; aspects: number[] }
  | { id: number; type: 'led'; mask: Uint8Array; cols: number; rows: number; dot: number }
  | { id: number; type: 'mosaic'; cells: Float32Array; photos: Float32Array; seed: number };

export type WorkerResult =
  | { type: 'thumb'; bitmap: ImageBitmap; aspect: number; color: [number, number, number] }
  | { type: 'hires'; bitmap: ImageBitmap }
  | { type: 'grid'; colors: Float32Array }
  | { type: 'atlas'; bitmap: ImageBitmap }
  | { type: 'led'; bitmap: ImageBitmap }
  | { type: 'mosaic'; assignment: Int32Array };

export type WorkerResponse = { id: number; ok: true; result: WorkerResult } | { id: number; ok: false; error: string };

type WithoutId<R> = R extends unknown ? Omit<R, 'id'> : never;

export type WorkerJob = WithoutId<WorkerRequest>;
