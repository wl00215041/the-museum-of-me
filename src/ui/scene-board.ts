import { SCENES, defaultScenes } from '../plan/scenes';
import { SCENE_IDS, type SceneId, type Scenes } from '../types';

/** The form's default choice is independent of the name, so the board does not reshuffle while typing. */
const FORM_SEED = 1;
/** Scenes that take newly added photos after the user has edited them (spec §4.1). */
const GROWING: readonly SceneId[] = ['photos', 'grid', 'floaters'];

export interface SceneBoard {
  /** The library changed (photos added, removed or reordered); ids in library order. */
  setPhotos(ids: number[]): void;
  /** Scenes the chosen length shows; null when unknown (music length). */
  setAvailable(ids: Set<SceneId> | null): void;
  /** Photo ids per scene, in scene order. */
  value(): Record<SceneId, number[]>;
  /** A photo's preview arrived: redraw its scene thumbnails. */
  repaint(id: number): void;
}

/** Photo ids → indices of `order` (the submitted photo order), dropping ids no longer in the library. */
export function scenesToIndices(order: number[], scenes: Record<SceneId, number[]>): Partial<Scenes> {
  const index = new Map(order.map((id, i) => [id, i]));
  return Object.fromEntries(SCENE_IDS.map((id) => [id, scenes[id].map((pid) => index.get(pid)).filter((i): i is number => i !== undefined)])) as Partial<Scenes>;
}

export function mountSceneBoard(
  root: HTMLElement,
  o: { draw(id: number, canvas: HTMLCanvasElement): void; dragged(): number | null; name(id: number): string },
): SceneBoard {
  let photos: number[] = [];
  let scenes = Object.fromEntries(SCENE_IDS.map((id) => [id, [] as number[]])) as Record<SceneId, number[]>;
  const edited = new Set<SceneId>();
  let available: Set<SceneId> | null = null;
  let sceneDrag: { scene: SceneId; id: number } | null = null;
  const messages = new Map<SceneId, string>();

  const defaults = (): Record<SceneId, number[]> => {
    const d = defaultScenes(Math.max(1, photos.length), FORM_SEED);
    return Object.fromEntries(SCENE_IDS.map((id) => [id, photos.length ? d[id].map((i) => photos[i]) : []])) as Record<SceneId, number[]>;
  };

  function add(scene: SceneId, id: number, before: number | null): void {
    const list = scenes[scene];
    if (list.includes(id)) return;
    if (list.length >= SCENES[scene].capacity) {
      messages.set(scene, `已達上限 ${SCENES[scene].capacity} 張`);
      render();
      return;
    }
    const at = before === null ? list.length : Math.max(0, list.indexOf(before));
    list.splice(at, 0, id);
    edited.add(scene);
    render();
  }

  function move(scene: SceneId, id: number, before: number | null): void {
    const list = scenes[scene];
    const from = list.indexOf(id);
    if (from < 0 || id === before) return;
    list.splice(from, 1);
    const at = before === null ? list.length : Math.max(0, list.indexOf(before));
    list.splice(at, 0, id);
    edited.add(scene);
    render();
  }

  function drop(scene: SceneId, before: number | null, ev: DragEvent): void {
    ev.preventDefault();
    ev.stopPropagation();
    messages.delete(scene);
    if (sceneDrag) {
      if (sceneDrag.scene === scene) move(scene, sceneDrag.id, before);
      else add(scene, sceneDrag.id, before);
      sceneDrag = null;
      return;
    }
    const id = o.dragged();
    if (id !== null) add(scene, id, before);
  }

  function tile(scene: SceneId, id: number): HTMLLIElement {
    const canvas = document.createElement('canvas');
    canvas.width = 80;
    canvas.height = 60;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove';
    remove.textContent = '×';
    remove.setAttribute('aria-label', '移出這個場景');
    remove.addEventListener('click', () => {
      scenes[scene] = scenes[scene].filter((x) => x !== id);
      edited.add(scene);
      messages.delete(scene);
      render();
    });
    const li = document.createElement('li');
    li.className = 'scene-tile';
    li.draggable = true;
    li.dataset.id = String(id);
    li.title = o.name(id);
    li.append(canvas, remove);
    li.addEventListener('dragstart', (ev) => {
      ev.stopPropagation();
      sceneDrag = { scene, id };
    });
    li.addEventListener('dragend', () => { sceneDrag = null; });
    li.addEventListener('dragover', (ev) => { if (o.dragged() !== null || sceneDrag) ev.preventDefault(); });
    li.addEventListener('drop', (ev) => drop(scene, id, ev));
    return li;
  }

  // Tiles are drawn when they scroll into view, so a large board does not queue every preview at once (review I2).
  const visible = new IntersectionObserver(
    (records) => {
      for (const record of records) {
        if (!record.isIntersecting) continue;
        const li = record.target as HTMLLIElement;
        visible.unobserve(li);
        li.dataset.drawn = '1';
        o.draw(Number(li.dataset.id), li.querySelector('canvas')!);
      }
    },
    { rootMargin: '200px' },
  );

  function render(): void {
    const head = document.createElement('div');
    head.className = 'scene-board-head';
    const title = document.createElement('h3');
    title.textContent = '場景';
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.id = 'scene-reset';
    reset.textContent = '恢復預設';
    reset.addEventListener('click', () => {
      edited.clear();
      messages.clear();
      scenes = defaults();
      render();
    });
    const hint = document.createElement('p');
    hint.className = 'scene-hint';
    hint.textContent = '把左側照片拖進場景即可加入；同一張照片可以放在多個場景。';
    head.append(title, reset);
    const sections = SCENE_IDS.map((id) => {
      const section = document.createElement('section');
      section.className = 'scene';
      section.dataset.scene = id;
      if (available && !available.has(id)) section.classList.add('unavailable');
      const h = document.createElement('h4');
      const count = document.createElement('span');
      count.className = 'count';
      count.textContent = `${scenes[id].length} / ${SCENES[id].capacity}`;
      h.append(SCENES[id].name, count);
      const list = document.createElement('ol');
      list.className = 'scene-tiles';
      list.append(...scenes[id].map((pid) => tile(id, pid)));
      section.append(h, list);
      if (available && !available.has(id)) section.append(Object.assign(document.createElement('p'), { className: 'note', textContent: '此長度不會出現' }));
      if (scenes[id].length === 0) section.append(Object.assign(document.createElement('p'), { className: 'empty', textContent: '空：產生影片時自動補上' }));
      const msg = messages.get(id);
      if (msg) section.append(Object.assign(document.createElement('p'), { className: 'scene-msg', textContent: msg, role: 'status' }));
      section.addEventListener('dragover', (ev) => {
        if (o.dragged() !== null || sceneDrag) {
          ev.preventDefault();
          section.classList.add('over');
        }
      });
      section.addEventListener('dragleave', () => section.classList.remove('over'));
      section.addEventListener('drop', (ev) => {
        section.classList.remove('over');
        drop(id, null, ev);
      });
      return section;
    });
    visible.disconnect();
    root.replaceChildren(head, hint, ...sections);
    for (const li of root.querySelectorAll<HTMLLIElement>('.scene-tile')) visible.observe(li);
  }

  return {
    setPhotos(ids) {
      if (ids.length === photos.length && ids.every((id, i) => id === photos[i])) return;
      const known = new Set(photos);
      const added = ids.filter((id) => !known.has(id));
      const kept = new Set(ids);
      photos = [...ids];
      const d = defaults();
      for (const id of SCENE_IDS) {
        if (!edited.has(id)) {
          scenes[id] = d[id];
          continue;
        }
        scenes[id] = scenes[id].filter((pid) => kept.has(pid));
        if (GROWING.includes(id)) for (const pid of added) if (scenes[id].length < SCENES[id].capacity) scenes[id].push(pid);
      }
      render();
    },
    setAvailable(ids) {
      available = ids;
      render();
    },
    value() {
      return Object.fromEntries(SCENE_IDS.map((id) => [id, [...scenes[id]]])) as Record<SceneId, number[]>;
    },
    repaint(id) {
      for (const canvas of root.querySelectorAll<HTMLCanvasElement>(`.scene-tile[data-id="${id}"][data-drawn="1"] canvas`)) o.draw(id, canvas);
    },
  };
}
