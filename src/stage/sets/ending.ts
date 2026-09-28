import { Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';
import type { ShotId } from '../../types';
import { smoothstep } from '../../util/math';
import { localU, spanOf, type SetContext, type StageSet } from '../context';
import { disposeScene } from '../dispose';
import { textUnits } from '../parts/led';
import { createTextPlane } from '../parts/text-plane';
import { darkScene } from './common';

export function buildEndingSet(ctx: SetContext, ids: ShotId[]): StageSet {
  const { content, tex, storyboard } = ctx;
  const span = spanOf(storyboard, 'ending');
  const scene = darkScene();
  const name = content.name.toUpperCase();
  const namePx = Math.min(150, Math.floor(1400 / Math.max(1, textUnits(name) * 0.6)));
  const card = tex.text({
    size: { width: 1760, height: 1080 },
    background: '#f4f4f2',
    align: 'left',
    padding: 150,
    lineGap: 0.12,
    lines: [
      { text: 'The Museum of Me', px: 84, weight: 500, family: 'serif', color: '#1d1d1d' },
      { text: name, px: namePx, weight: 800, family: 'grotesk', color: '#1d1d1d' },
      { text: 'EXHIBITION', px: 150, weight: 800, family: 'grotesk', color: '#1d1d1d' },
      { text: content.dateLabel, px: 40, weight: 500, family: 'grotesk', color: '#666666' },
    ],
  });
  const cardMaterial = new MeshBasicMaterial({ map: card.texture, transparent: true, opacity: 0 });
  cardMaterial.userData.owned = true;
  cardMaterial.userData.ownsMap = true;
  const cardMesh = new Mesh(new PlaneGeometry(4.4, 2.7), cardMaterial);
  cardMesh.name = 'end-card';
  cardMesh.rotation.set(-0.12, 0.22, 0);
  const tagline = createTextPlane(
    tex.text({ color: '#e8e8e8', lines: [{ text: 'Create and explore a visual archive of your memories.', px: 36, weight: 300 }] }),
    4.6,
    0.3,
  );
  tagline.name = 'tagline';
  tagline.position.y = -1.95;
  const taglineMaterial = tagline.material as MeshBasicMaterial;
  taglineMaterial.opacity = 0;
  scene.add(cardMesh, tagline);

  return {
    ids,
    scene,
    dark: true,
    bloom: 0.25, // the end card stays crisp, as in the original
    update(t) {
      const u = localU(span, t);
      const a = smoothstep(0, 0.35, u);
      cardMaterial.opacity = a;
      cardMesh.position.y = -0.25 * (1 - a);
      taglineMaterial.opacity = smoothstep(0.25, 0.55, u);
    },
    dispose: () => disposeScene(scene),
  };
}
