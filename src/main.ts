import './ui/styles.css';
import { buildProject, type Project } from './app/project';
import { createPlayer, type Player } from './preview/player';
import { createRenderer, type MuseumRenderer } from './render/renderer';
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
const stageStatus = byId('stage-status');
const busy = byId('busy');
const busyLabel = byId('busy-label');
const setupErrors = byId('setup-errors');

interface Session {
  project: Project;
  canvas: HTMLCanvasElement;
  renderer: MuseumRenderer;
  player: Player;
}

let session: Session | null = null;

function showBusy(message: string): void {
  busyLabel.textContent = message;
  busy.hidden = false;
}

function fitPreview(s: Session): void {
  const width = Math.max(320, Math.min(960, Math.round(s.canvas.clientWidth * devicePixelRatio)));
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
  const total = project.timeline.total;
  const renderer = createRenderer({ canvas, museum: project.museum, camera: project.camera, total, endCard: project.endCard });
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

mountSetupForm(setup, async (input) => {
  showBusy('正在布置展廳…');
  setupErrors.textContent = '';
  try {
    openStage(await buildProject(input, showBusy));
  } catch (err) {
    closeStage();
    setupErrors.textContent = err instanceof Error ? err.message : String(err);
  } finally {
    busy.hidden = true;
  }
});

playButton.addEventListener('click', () => session?.player.toggle());
scrub.addEventListener('input', () => session?.player.seek(Number(scrub.value)));
backButton.addEventListener('click', closeStage);
window.addEventListener('resize', () => {
  if (!session) return;
  fitPreview(session);
  session.player.seek(session.player.time);
});
