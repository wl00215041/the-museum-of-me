import type { ProjectInput, Resolution } from '../types';
import { MAX_PHOTOS, capPhotos, isImageFile, parseDuration, parseKeywords, validateSetup } from './validate';

interface PhotoEntry {
  id: number;
  file: File;
  url: string;
  caption: string;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

export function mountSetupForm(root: HTMLElement, onSubmit: (input: ProjectInput) => void): void {
  const q = <T extends Element>(selector: string): T => {
    const node = root.querySelector<T>(selector);
    if (!node) throw new Error(`${selector} is missing from the setup form`);
    return node;
  };
  const form = q<HTMLFormElement>('#setup-form');
  const photoInput = q<HTMLInputElement>('#photo-input');
  const dropzone = q<HTMLElement>('#dropzone');
  const list = q<HTMLOListElement>('#photo-list');
  const notice = q<HTMLElement>('#setup-notice');
  const errors = q<HTMLElement>('#setup-errors');
  const generate = q<HTMLButtonElement>('#generate');
  const name = q<HTMLInputElement>('#name');
  const subtitle = q<HTMLInputElement>('#subtitle');
  const date = q<HTMLInputElement>('#date');
  const keywords = q<HTMLTextAreaElement>('#keywords');
  const duration = q<HTMLSelectElement>('#duration');
  const resolution = q<HTMLSelectElement>('#resolution');
  const music = q<HTMLInputElement>('#music');

  let entries: PhotoEntry[] = [];
  let portraitId: number | null = null;
  let nextId = 1;
  let dragId: number | null = null;
  let touched = false;

  function refresh(): void {
    const problems = validateSetup({ photoCount: entries.length, name: name.value });
    generate.disabled = problems.length > 0;
    errors.textContent = touched ? problems.join('；') : '';
  }

  function render(): void {
    list.replaceChildren(...entries.map(renderItem));
    refresh();
  }

  function move(from: number, to: number): void {
    if (from < 0 || to < 0 || to >= entries.length || from === to) return;
    const [entry] = entries.splice(from, 1);
    entries.splice(to, 0, entry);
    render();
  }

  function remove(id: number): void {
    const entry = entries.find((e) => e.id === id);
    if (entry) URL.revokeObjectURL(entry.url);
    entries = entries.filter((e) => e.id !== id);
    if (portraitId === id) portraitId = entries[0]?.id ?? null;
    render();
  }

  function addFiles(files: File[]): void {
    touched = true;
    const images = files.filter(isImageFile);
    const { kept, dropped } = capPhotos(images, MAX_PHOTOS - entries.length);
    for (const file of kept) entries.push({ id: nextId++, file, url: URL.createObjectURL(file), caption: '' });
    if (portraitId === null && entries.length > 0) portraitId = entries[0].id;
    const messages: string[] = [];
    if (dropped > 0) messages.push(`最多 ${MAX_PHOTOS} 張照片，已略過 ${dropped} 張`);
    if (files.length > images.length) messages.push(`已略過 ${files.length - images.length} 個非圖片檔`);
    notice.textContent = messages.join('；');
    render();
  }

  function renderItem(entry: PhotoEntry, index: number): HTMLLIElement {
    const caption = el('input', { className: 'caption', type: 'text', placeholder: '說明文字（選填）', maxLength: 80, value: entry.caption });
    caption.addEventListener('input', () => { entry.caption = caption.value; });
    const radio = el('input', { type: 'radio', name: 'portrait', checked: entry.id === portraitId });
    radio.addEventListener('change', () => { portraitId = entry.id; });
    const up = el('button', { type: 'button', className: 'move-up', textContent: '↑', title: '往前移', disabled: index === 0 });
    up.addEventListener('click', () => move(index, index - 1));
    const down = el('button', { type: 'button', className: 'move-down', textContent: '↓', title: '往後移', disabled: index === entries.length - 1 });
    down.addEventListener('click', () => move(index, index + 1));
    const del = el('button', { type: 'button', className: 'remove', textContent: '✕', title: '移除' });
    del.addEventListener('click', () => remove(entry.id));

    const li = el(
      'li',
      { className: 'photo-item', draggable: true },
      el('img', { src: entry.url, alt: '' }),
      el('span', { className: 'idx' }, `No. ${String(index + 1).padStart(2, '0')}`),
      caption,
      el('label', { className: 'portrait' }, radio, ' 主視覺'),
      el('span', { className: 'tools' }, up, down, del),
    );
    li.addEventListener('dragstart', () => { dragId = entry.id; li.classList.add('dragging'); });
    li.addEventListener('dragend', () => { dragId = null; li.classList.remove('dragging'); });
    li.addEventListener('dragover', (ev) => { if (dragId !== null) ev.preventDefault(); });
    li.addEventListener('drop', (ev) => {
      if (dragId === null) return;
      ev.preventDefault();
      move(entries.findIndex((e) => e.id === dragId), index);
    });
    return li;
  }

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

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    touched = true;
    refresh();
    if (generate.disabled) return;
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
      music: music.files?.[0] ?? null,
    });
  });

  refresh();
}
