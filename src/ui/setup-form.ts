import { buildSequence } from '../plan/sequence';
import { scenesInCut } from '../plan/scenes';
import type { ProjectInput, Resolution } from '../types';
import { mountSceneBoard, scenesToIndices } from './scene-board';
import { MAX_PHOTOS, capPhotos, isImageFile, parseDuration, parseKeywords, parseMusicStyle, validateSetup } from './validate';

export interface PreviewSource {
  thumb(file: Blob, maxEdge: number): Promise<{ bitmap: ImageBitmap }>;
}

interface PhotoEntry {
  id: number;
  file: File;
  caption: string;
  preview: ImageBitmap | null;
  requested: boolean;
  /** The file could not be decoded: never requested again, shown as broken everywhere. */
  failed?: boolean;
}

const PREVIEW_EDGE = 160;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function drawCover(canvas: HTMLCanvasElement, bitmap: ImageBitmap): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const scale = Math.max(canvas.width / bitmap.width, canvas.height / bitmap.height);
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
}

export function mountSetupForm(root: HTMLElement, previews: PreviewSource, onSubmit: (input: ProjectInput) => void): void {
  const q = <T extends Element>(selector: string): T => {
    const node = root.querySelector<T>(selector);
    if (!node) throw new Error(`${selector} is missing from the setup form`);
    return node;
  };
  const form = q<HTMLFormElement>('#setup-form');
  const photoInput = q<HTMLInputElement>('#photo-input');
  const dropzone = q<HTMLElement>('#dropzone');
  const grid = q<HTMLOListElement>('#photo-grid');
  const notice = q<HTMLElement>('#setup-notice');
  const count = q<HTMLElement>('#photo-count');
  const detail = q<HTMLElement>('#photo-detail');
  const detailPreview = q<HTMLCanvasElement>('#detail-preview');
  const detailIndex = q<HTMLElement>('#detail-index');
  const detailCaption = q<HTMLInputElement>('#detail-caption');
  const detailPortrait = q<HTMLButtonElement>('#detail-portrait');
  const detailLeft = q<HTMLButtonElement>('#detail-left');
  const detailRight = q<HTMLButtonElement>('#detail-right');
  const detailRemove = q<HTMLButtonElement>('#detail-remove');
  const errors = q<HTMLElement>('#setup-errors');
  const generate = q<HTMLButtonElement>('#generate');
  const name = q<HTMLInputElement>('#name');
  const subtitle = q<HTMLInputElement>('#subtitle');
  const date = q<HTMLInputElement>('#date');
  const keywords = q<HTMLTextAreaElement>('#keywords');
  const duration = q<HTMLSelectElement>('#duration');
  const resolution = q<HTMLSelectElement>('#resolution');
  const musicStyle = q<HTMLSelectElement>('#music-style');
  const musicUpload = q<HTMLElement>('#music-upload');
  const music = q<HTMLInputElement>('#music');
  const musicLength = q<HTMLOptionElement>('#duration option[value="music"]');

  let entries: PhotoEntry[] = [];
  let portraitId: number | null = null;
  let selectedId: number | null = null;
  let nextId = 1;
  let dragId: number | null = null;
  let touched = false;

  const tileOf = (id: number) => grid.querySelector<HTMLLIElement>(`[data-id="${id}"]`);
  const board = mountSceneBoard(q<HTMLElement>('#scene-board'), {
    draw(id, canvas) {
      const entry = entries.find((e) => e.id === id);
      if (!entry) return;
      if (entry.failed) canvas.parentElement?.classList.add('broken');
      else if (entry.preview) drawCover(canvas, entry.preview);
      else requestPreview(entry);
    },
    dragged: () => dragId,
    name: (id) => entries.find((e) => e.id === id)?.file.name ?? '',
  });
  const syncScenesToLength = () => {
    const mode = parseDuration(duration.value);
    board.setAvailable(mode === 'music' ? null : scenesInCut(buildSequence({ photoCount: Math.max(1, entries.length), lengthMode: mode, musicDuration: null })));
  };

  const observer = new IntersectionObserver(
    (records) => {
      for (const record of records) {
        if (!record.isIntersecting) continue;
        observer.unobserve(record.target);
        const entry = entries.find((e) => e.id === Number((record.target as HTMLElement).dataset.id));
        if (entry) requestPreview(entry);
      }
    },
    { rootMargin: '200px' },
  );

  function paint(entry: PhotoEntry): void {
    const canvas = tileOf(entry.id)?.querySelector('canvas');
    if (canvas && entry.preview) drawCover(canvas, entry.preview);
    if (selectedId === entry.id && entry.preview) drawCover(detailPreview, entry.preview);
    if (entry.preview) board.repaint(entry.id);
  }

  function requestPreview(entry: PhotoEntry): void {
    if (entry.requested || entry.failed) return;
    entry.requested = true;
    previews.thumb(entry.file, PREVIEW_EDGE).then(
      ({ bitmap }) => {
        entry.preview = bitmap;
        paint(entry);
      },
      (err: Error) => {
        entry.requested = false;
        const tile = tileOf(entry.id);
        if (err.message.includes('disposed')) {
          if (tile) observer.observe(tile);
          return;
        }
        entry.failed = true;
        tile?.classList.add('broken');
        board.repaint(entry.id);
      },
    );
  }

  function refresh(): void {
    const problems = validateSetup({ photoCount: entries.length, name: name.value });
    generate.disabled = problems.length > 0;
    errors.textContent = touched ? problems.join('；') : '';
    count.textContent = `${entries.length} / ${MAX_PHOTOS} 張`;
  }

  function renderDetail(): void {
    const index = entries.findIndex((e) => e.id === selectedId);
    if (index < 0) {
      detail.hidden = true;
      return;
    }
    const entry = entries[index];
    detail.hidden = false;
    detailIndex.textContent = `No. ${String(index + 1).padStart(3, '0')}・${entry.file.name}`;
    detailCaption.value = entry.caption;
    detailLeft.disabled = index === 0;
    detailRight.disabled = index === entries.length - 1;
    const isPortrait = entry.id === portraitId;
    detailPortrait.disabled = isPortrait;
    detailPortrait.textContent = isPortrait ? '已是主視覺' : '設為主視覺';
    detailPreview.getContext('2d')?.clearRect(0, 0, detailPreview.width, detailPreview.height);
    if (entry.preview) drawCover(detailPreview, entry.preview);
  }

  function renderTile(entry: PhotoEntry, index: number): HTMLLIElement {
    const canvas = el('canvas', { width: 120, height: 90 });
    const tile = el('li', { className: 'photo-tile', draggable: true, title: entry.file.name }, canvas, el('span', { className: 'idx' }, String(index + 1).padStart(3, '0')));
    tile.dataset.id = String(entry.id);
    if (entry.id === portraitId) tile.append(el('span', { className: 'badge' }, '主視覺'));
    if (entry.id === selectedId) tile.classList.add('selected');
    if (entry.failed) tile.classList.add('broken');
    tile.addEventListener('click', () => {
      selectedId = entry.id;
      render();
    });
    tile.addEventListener('dragstart', () => { dragId = entry.id; tile.classList.add('dragging'); });
    tile.addEventListener('dragend', () => { dragId = null; tile.classList.remove('dragging'); });
    tile.addEventListener('dragover', (ev) => { if (dragId !== null) ev.preventDefault(); });
    tile.addEventListener('drop', (ev) => {
      if (dragId === null) return;
      ev.preventDefault();
      move(entries.findIndex((e) => e.id === dragId), entries.findIndex((e) => e.id === entry.id));
    });
    return tile;
  }

  function render(): void {
    observer.disconnect();
    grid.replaceChildren(...entries.map(renderTile));
    for (const entry of entries) {
      if (entry.preview) paint(entry);
      else observer.observe(tileOf(entry.id)!);
    }
    board.setPhotos(entries.map((e) => e.id));
    renderDetail();
    refresh();
  }

  function move(from: number, to: number): void {
    if (from < 0 || to < 0 || to >= entries.length || from === to) return;
    const [entry] = entries.splice(from, 1);
    entries.splice(to, 0, entry);
    render();
  }

  function remove(id: number): void {
    const index = entries.findIndex((e) => e.id === id);
    if (index < 0) return;
    entries[index].preview?.close();
    entries.splice(index, 1);
    if (portraitId === id) portraitId = entries[0]?.id ?? null;
    selectedId = entries[Math.min(index, entries.length - 1)]?.id ?? null;
    render();
  }

  function addFiles(files: File[]): void {
    touched = true;
    const images = files.filter(isImageFile);
    const { kept, dropped } = capPhotos(images, MAX_PHOTOS - entries.length);
    for (const file of kept) entries.push({ id: nextId++, file, caption: '', preview: null, requested: false });
    if (portraitId === null && entries.length > 0) portraitId = entries[0].id;
    const messages: string[] = [];
    if (dropped > 0) messages.push(`最多 ${MAX_PHOTOS} 張照片，已略過 ${dropped} 張`);
    if (files.length > images.length) messages.push(`已略過 ${files.length - images.length} 個非圖片檔`);
    notice.textContent = messages.join('；');
    render();
  }

  function syncMusicLength(): void {
    const upload = musicStyle.value === 'upload';
    musicUpload.hidden = !upload;
    musicLength.disabled = !(upload && (music.files?.length ?? 0) > 0);
    if (musicLength.disabled && duration.value === 'music') duration.value = 'auto';
    syncScenesToLength();
  }

  detailCaption.addEventListener('input', () => {
    const entry = entries.find((e) => e.id === selectedId);
    if (entry) entry.caption = detailCaption.value;
  });
  detailPortrait.addEventListener('click', () => {
    portraitId = selectedId;
    render();
  });
  detailLeft.addEventListener('click', () => {
    const i = entries.findIndex((e) => e.id === selectedId);
    move(i, i - 1);
  });
  detailRight.addEventListener('click', () => {
    const i = entries.findIndex((e) => e.id === selectedId);
    move(i, i + 1);
  });
  detailRemove.addEventListener('click', () => {
    if (selectedId !== null) remove(selectedId);
  });

  photoInput.addEventListener('change', () => {
    addFiles([...(photoInput.files ?? [])]);
    photoInput.value = '';
  });
  // Keep the browser from navigating to image files dropped outside the drop zone.
  window.addEventListener('dragover', (ev) => ev.preventDefault());
  window.addEventListener('drop', (ev) => ev.preventDefault());
  dropzone.addEventListener('dragenter', () => dropzone.classList.add('over'));
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('over'));
  dropzone.addEventListener('drop', (ev) => {
    dropzone.classList.remove('over');
    addFiles([...(ev.dataTransfer?.files ?? [])]);
  });
  name.addEventListener('input', () => {
    touched = true;
    refresh();
  });
  musicStyle.addEventListener('change', syncMusicLength);
  music.addEventListener('change', syncMusicLength);
  duration.addEventListener('change', syncScenesToLength);

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    touched = true;
    refresh();
    if (generate.disabled) return;
    const style = parseMusicStyle(musicStyle.value);
    onSubmit({
      photos: entries.map((e) => e.file),
      captions: entries.map((e) => e.caption.trim()),
      portraitIndex: Math.max(0, entries.findIndex((e) => e.id === portraitId)),
      name: name.value.trim(),
      subtitle: subtitle.value.trim(),
      date: date.value,
      keywords: parseKeywords(keywords.value),
      durationMode: parseDuration(duration.value),
      resolution: resolution.value as Resolution,
      musicStyle: style,
      music: style === 'upload' ? music.files?.[0] ?? null : null,
      scenes: scenesToIndices(entries.map((e) => e.id), board.value()),
    });
  });

  syncMusicLength();
  refresh();
}
