import { BoxGeometry, DirectionalLight, HemisphereLight, Matrix4, Mesh, PlaneGeometry, Quaternion, Vector3 } from 'three';
import type { ShotId } from '../../types';
import { hiresOf, type SetContext, type StageSet } from '../context';
import { disposeScene } from '../dispose';
import type { CanvasItem } from '../layout';
import { buildAtlasInstances } from '../parts/atlas-mesh';
import { BLOCK_DEPTH, createCanvasBlock } from '../parts/canvas-block';
import { createTextPlane } from '../parts/text-plane';
import { WALL } from '../wall-run';
import { addVisitors, createPlaque, whiteScene } from './common';

export function buildWallSet(ctx: SetContext, ids: ShotId[]): StageSet {
  const { layout, content, tex, mats } = ctx;
  const w = layout.wall;
  const scene = whiteScene(0xe9e8e4);
  scene.add(new HemisphereLight(0xffffff, 0xd6d3cc, 1.25));
  const sun = new DirectionalLight(0xffffff, 0.55);
  sun.position.set(-6, 9, 12);
  scene.add(sun);

  const length = w.wallEnd - w.wallStart;
  const midX = (w.wallStart + w.wallEnd) / 2;
  const wall = new Mesh(new PlaneGeometry(length, WALL.height), mats.wall);
  wall.position.set(midX, WALL.height / 2, 0);
  const floor = new Mesh(new PlaneGeometry(length, 16), mats.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(midX, 0, 8);
  const skirting = new Mesh(new BoxGeometry(length, 0.06, 0.02), mats.skirting);
  skirting.position.set(midX, 0.03, 0.01);
  scene.add(wall, floor, skirting);

  const title = createTextPlane(
    tex.text({
      color: '#1f1f1f',
      lineGap: 0.5,
      padding: 24,
      lines: [
        { text: 'The Museum of Me', px: 120, weight: 500, family: 'serif' },
        { text: 'Create and explore a visual archive of your social life.', px: 30, weight: 400, spacing: 1 },
      ],
    }),
    w.title.width,
    w.title.height,
  );
  title.name = 'title';
  title.position.set(w.title.center[0], w.title.center[1], 0.01);
  scene.add(title);

  const block = (item: CanvasItem, name: string) => {
    const mesh = createCanvasBlock(hiresOf(content, item.photoIndex), content.library.aspects[item.photoIndex], item.width, item.height, mats.blockSide);
    mesh.name = name;
    mesh.position.set(item.center[0], item.center[1], BLOCK_DEPTH / 2);
    scene.add(mesh);
  };

  if (w.intro) {
    block(w.intro.avatar, 'intro-avatar');
    const intro = createTextPlane(
      tex.text({
        align: 'left',
        color: '#262626',
        lineGap: 0.3,
        padding: 16,
        lines: [
          { text: 'This exhibition is a journey of', px: 64, weight: 400, family: 'serif' },
          { text: `visualization that explores who ${content.name} is.`, px: 64, weight: 400, family: 'serif' },
        ],
      }),
      w.intro.width,
      w.intro.height,
    );
    intro.name = 'intro';
    intro.position.set(w.intro.center[0], w.intro.center[1], 0.01);
    scene.add(intro);
  }

  const exhibition = createTextPlane(
    tex.text({
      align: 'left',
      color: '#1b1b1b',
      lineGap: 0.04,
      padding: 20,
      lines: [
        { text: content.name.toUpperCase(), px: 200, weight: 800, family: 'grotesk' },
        { text: 'EXHIBITION', px: 200, weight: 800, family: 'grotesk' },
        { text: content.stamp, px: 64, weight: 500, family: 'grotesk' },
      ],
    }),
    w.exhibition.width,
    w.exhibition.height,
  );
  exhibition.name = 'exhibition';
  exhibition.position.set(w.exhibition.center[0], w.exhibition.center[1], 0.01);
  scene.add(exhibition);

  let section = 1;
  if (w.portraits) {
    scene.add(createPlaque(tex, 'Portraits', section++, w.portraits.label, mats));
    for (const item of w.portraits.items) block(item, 'portrait-block');
  }
  scene.add(createPlaque(tex, 'Photos', section, w.photos.label, mats));
  const matrix = (item: CanvasItem) =>
    new Matrix4().compose(new Vector3(item.center[0], item.center[1], BLOCK_DEPTH / 2), new Quaternion(), new Vector3(item.width, item.height, 1));
  const swarm = buildAtlasInstances({
    geometry: new BoxGeometry(1, 1, BLOCK_DEPTH),
    library: content.library,
    items: w.photos.items.map((item) => ({ photoIndex: item.photoIndex, matrix: matrix(item) })),
    material: (atlas) => mats.atlas(content.library.atlases[atlas], true),
    rect: 'fit',
  });
  for (const mesh of swarm) {
    mesh.name = 'photo-swarm';
    scene.add(mesh);
  }

  addVisitors(scene, w.visitors, mats);
  return { ids, scene, dark: false, update: () => {}, dispose: () => disposeScene(scene) };
}
