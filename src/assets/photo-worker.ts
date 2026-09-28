import { ATLAS, cellPixelBox, fitWithin } from './atlas';
import { assignMosaic } from './mosaic';
import type { WorkerRequest, WorkerResponse, WorkerResult } from './worker-protocol';

function canvas2d(width: number, height: number) {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('OffscreenCanvas 2D is unavailable');
  ctx.imageSmoothingQuality = 'high';
  return { canvas, ctx };
}

const decode = (file: Blob): Promise<ImageBitmap> => createImageBitmap(file, { imageOrientation: 'from-image' });

function averageColor(ctx: OffscreenCanvasRenderingContext2D, width: number, height: number): [number, number, number] {
  const data = ctx.getImageData(0, 0, width, height).data;
  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }
  const n = width * height * 255;
  return [r / n, g / n, b / n];
}

async function resized(file: Blob, maxEdge: number) {
  const bitmap = await decode(file);
  const aspect = bitmap.width / bitmap.height;
  const size = fitWithin(bitmap.width, bitmap.height, maxEdge);
  const { canvas, ctx } = canvas2d(size.width, size.height);
  ctx.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  return { canvas, ctx, size, aspect };
}

async function handle(req: WorkerRequest): Promise<[WorkerResult, Transferable[]]> {
  switch (req.type) {
    case 'thumb': {
      const { canvas, ctx, size, aspect } = await resized(req.file, req.maxEdge);
      const color = averageColor(ctx, size.width, size.height);
      const bitmap = canvas.transferToImageBitmap();
      return [{ type: 'thumb', bitmap, aspect, color }, [bitmap]];
    }
    case 'hires': {
      const { canvas } = await resized(req.file, req.maxEdge);
      const bitmap = canvas.transferToImageBitmap();
      return [{ type: 'hires', bitmap }, [bitmap]];
    }
    case 'grid': {
      const bitmap = await decode(req.file);
      const target = req.cols / req.rows;
      const source = bitmap.width / bitmap.height;
      const sw = source > target ? bitmap.height * target : bitmap.width;
      const sh = source > target ? bitmap.height : bitmap.width / target;
      const { ctx } = canvas2d(req.cols, req.rows);
      ctx.drawImage(bitmap, (bitmap.width - sw) / 2, (bitmap.height - sh) / 2, sw, sh, 0, 0, req.cols, req.rows);
      bitmap.close();
      const data = ctx.getImageData(0, 0, req.cols, req.rows).data;
      const colors = new Float32Array(req.cols * req.rows * 3);
      for (let i = 0; i < req.cols * req.rows; i++) {
        colors[i * 3] = data[i * 4] / 255;
        colors[i * 3 + 1] = data[i * 4 + 1] / 255;
        colors[i * 3 + 2] = data[i * 4 + 2] / 255;
      }
      return [{ type: 'grid', colors }, [colors.buffer]];
    }
    case 'atlas': {
      const { canvas, ctx } = canvas2d(ATLAS.size, ATLAS.size);
      req.thumbs.forEach((thumb, slot) => {
        const box = cellPixelBox(slot, req.aspects[slot]);
        ctx.drawImage(thumb, box.x, box.y, box.width, box.height);
        thumb.close();
      });
      const bitmap = canvas.transferToImageBitmap();
      return [{ type: 'atlas', bitmap }, [bitmap]];
    }
    case 'led': {
      const { cols, rows, dot, mask } = req;
      const { canvas, ctx } = canvas2d(cols * dot, rows * dot);
      ctx.fillStyle = '#050505';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const radius = dot * 0.36;
      // One path per row: a single path with every dot of the wall (~250k arcs) is silently dropped by the canvas.
      const fillDots = (lit: boolean, style: string) => {
        ctx.fillStyle = style;
        for (let y = 0; y < rows; y++) {
          ctx.beginPath();
          for (let x = 0; x < cols; x++) {
            if (mask[y * cols + x] > 0 !== lit) continue;
            const cx = (x + 0.5) * dot;
            const cy = (y + 0.5) * dot;
            ctx.moveTo(cx + radius, cy);
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          }
          ctx.fill();
        }
      };
      fillDots(false, 'rgba(255, 255, 255, 0.07)');
      fillDots(true, '#ffffff');
      const bitmap = canvas.transferToImageBitmap();
      return [{ type: 'led', bitmap }, [bitmap]];
    }
    case 'mosaic': {
      const assignment = assignMosaic(req.cells, req.photos, req.seed);
      return [{ type: 'mosaic', assignment }, [assignment.buffer]];
    }
  }
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  let response: WorkerResponse;
  let transfer: Transferable[] = [];
  try {
    const [result, t] = await handle(req);
    response = { id: req.id, ok: true, result };
    transfer = t;
  } catch (err) {
    response = { id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  self.postMessage(response, { transfer });
};
