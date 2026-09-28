import './ui/styles.css';
import { buildProject, type Project } from './app/project';
import { createPhotoPool, type PhotoPool } from './assets/photo-pool';
import { exportVideo, type ExportProgress } from './export/exporter';
import { exportFilename } from './export/filename';
import { createPlayer, type Player } from './preview/player';
import { createWorldRenderer, type MuseumRenderer } from './render/world-renderer';
import { FPS, RESOLUTIONS } from './types';
import { mountSetupForm } from './ui/setup-form';
import { formatTime } from './util/format';

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} is missing from index.html`);
  return el as T;
}

const setup = byId('setup');
const stage = byId('stage');
const viewport = byId('viewport');
const playButton = byId<HTMLButtonElement>('play');
const scrub = byId<HTMLInputElement>('scrub');
const timeLabel = byId('time');
const backButton = byId<HTMLButtonElement>('back');
const exportButton = byId<HTMLButtonElement>('export');
const exportPanel = byId('export-panel');
const exportProgress = byId<HTMLProgressElement>('export-progress');
const exportLabel = byId('export-label');
const cancelButton = byId<HTMLButtonElement>('cancel-export');
const stageStatus = byId('stage-status');
const busy = byId('busy');
const busyLabel = byId('busy-label');
const busyCancel = byId<HTMLButtonElement>('busy-cancel');
const setupErrors = byId('setup-errors');

interface Session {
  project: Project;
  canvas: HTMLCanvasElement;
  renderer: MuseumRenderer;
  player: Player;
}

let pool: PhotoPool = createPhotoPool();
/** Bumped by every new build and by cancel; a finishing build that is no longer current is discarded. */
let buildGeneration = 0;
let session: Session | null = null;
let exporting: AbortController | null = null;

function showBusy(message: string): void {
  busyLabel.textContent = message;
  busy.hidden = false;
}

function fitPreview(s: Session): void {
  // One rendered pixel per device pixel, so high-DPI screens do not stretch (and blur) the preview.
  const width = Math.max(320, Math.min(1920, Math.round(s.canvas.clientWidth * devicePixelRatio)));
  s.renderer.setSize(width, Math.round((width * 9) / 16));
}

function onTick(total: number) {
  return (t: number, playing: boolean): void => {
    scrub.value = String(t);
    timeLabel.textContent = `${formatTime(t)} / ${formatTime(total)}`;
    playButton.textContent = playing ? '❚❚' : '▶';
    playButton.setAttribute('aria-label', playing ? '暫停' : '播放');
  };
}

function openStage(project: Project): void {
  const canvas = document.createElement('canvas');
  viewport.replaceChildren(canvas);
  setup.hidden = true;
  stage.hidden = false;
  const total = project.sequence.total;
  const renderer = createWorldRenderer({ canvas, world: project.world, camera: project.camera, sequence: project.sequence });
  const player = createPlayer({ render: renderer.renderFrame, audio: project.soundtrack, total, onTick: onTick(total) });
  session = { project, canvas, renderer, player };
  scrub.max = String(total);
  stageStatus.textContent = project.warnings.join('\n');
  fitPreview(session);
  player.seek(0);
}

function closeStage(): void {
  if (session) {
    session.player.dispose();
    session.renderer.dispose();
    session.project.dispose();
    session = null;
  }
  viewport.replaceChildren();
  stage.hidden = true;
  setup.hidden = false;
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function showProgress(p: ExportProgress): void {
  const fraction = p.frame / p.frames;
  exportProgress.value = fraction;
  const pct = Math.floor(fraction * 100);
  exportLabel.textContent = p.etaSeconds === null ? `匯出中 ${pct}%` : `匯出中 ${pct}%・剩餘約 ${formatTime(p.etaSeconds)}`;
}

function setExporting(on: boolean): void {
  exportPanel.hidden = !on;
  exportButton.disabled = on;
  backButton.disabled = on;
  playButton.disabled = on;
  scrub.disabled = on;
}

async function runExport(s: Session): Promise<void> {
  const { width, height, bitrate } = RESOLUTIONS[s.project.input.resolution];
  const controller = new AbortController();
  exporting = controller;
  const onContextLost = () => controller.abort(new Error('WebGL 內容遺失，請返回編輯後重新生成'));
  s.canvas.addEventListener('webglcontextlost', onContextLost);
  s.player.pause();
  setExporting(true);
  exportProgress.value = 0;
  exportLabel.textContent = '準備中…';
  stageStatus.textContent = '';
  s.renderer.setSize(width, height);
  try {
    const result = await exportVideo({
      canvas: s.canvas, renderFrame: s.renderer.renderFrame, total: s.project.sequence.total, fps: FPS,
      width, height, bitrate, audio: s.project.soundtrack, signal: controller.signal, onProgress: showProgress,
    });
    download(result.blob, exportFilename(s.project.input.name, new Date(), result.extension));
    stageStatus.textContent = result.extension === 'webm' ? '此瀏覽器不支援 H.264，已改為輸出 WebM。' : '匯出完成。';
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === 'AbortError';
    stageStatus.textContent = aborted ? '已取消匯出' : err instanceof Error ? err.message : String(err);
  } finally {
    s.canvas.removeEventListener('webglcontextlost', onContextLost);
    exporting = null;
    setExporting(false);
    fitPreview(s);
    s.player.seek(s.player.time);
  }
}

mountSetupForm(setup, { thumb: (file, maxEdge) => pool.thumb(file, maxEdge) }, async (input) => {
  const generation = ++buildGeneration;
  setupErrors.textContent = '';
  showBusy('正在布置展廳…');
  try {
    const project = await buildProject(input, pool, (message) => {
      if (generation === buildGeneration) showBusy(message);
    });
    if (generation !== buildGeneration) {
      project.dispose();
      return;
    }
    openStage(project);
  } catch (err) {
    if (generation !== buildGeneration) return;
    closeStage();
    setupErrors.textContent = err instanceof Error ? err.message : String(err);
  } finally {
    if (generation === buildGeneration) busy.hidden = true;
  }
});

busyCancel.addEventListener('click', () => {
  buildGeneration++;
  pool.dispose();
  pool = createPhotoPool();
  busy.hidden = true;
  closeStage();
});
playButton.addEventListener('click', () => session?.player.toggle());
scrub.addEventListener('input', () => session?.player.seek(Number(scrub.value)));
backButton.addEventListener('click', closeStage);
exportButton.addEventListener('click', () => {
  if (session && !exporting) void runExport(session);
});
cancelButton.addEventListener('click', () => exporting?.abort());
window.addEventListener('resize', () => {
  if (!session || exporting) return;
  fitPreview(session);
  session.player.seek(session.player.time);
});
