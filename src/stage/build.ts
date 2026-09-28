import type { StageTextureFactory } from '../assets/texture-factory';
import type { ShotId, Storyboard } from '../types';
import type { SetContext, StageContent, StageSet } from './context';
import type { StageLayout } from './layout';
import { createStageMaterials } from './parts/materials';
import { buildEndingSet } from './sets/ending';
import { buildLikesSet } from './sets/likes';
import { buildMomentsSet } from './sets/moments';
import { buildMosaicSet } from './sets/mosaic';
import { buildNetworkSet } from './sets/network';
import { buildRobotsSet } from './sets/robots';
import { buildVideosSet } from './sets/videos';
import { buildWallSet } from './sets/wall';
import { buildWordsSet } from './sets/words';
import { WALL_SHOTS } from './wall-run';

export interface Stage {
  sets: StageSet[];
  setFor(id: ShotId): StageSet;
  dispose(): void;
}

const BUILDERS: Partial<Record<ShotId, (ctx: SetContext, ids: ShotId[]) => StageSet>> = {
  moments: buildMomentsSet,
  words: buildWordsSet,
  likes: buildLikesSet,
  videos: buildVideosSet,
  robots: buildRobotsSet,
  mosaic: buildMosaicSet,
  network: buildNetworkSet,
  ending: buildEndingSet,
};

export function buildStage(storyboard: Storyboard, layout: StageLayout, content: StageContent, tex: StageTextureFactory): Stage {
  const mats = createStageMaterials();
  const ctx: SetContext = { storyboard, layout, content, tex, mats };
  const ids = storyboard.shots.map((s) => s.id);
  const sets: StageSet[] = [buildWallSet(ctx, ids.filter((id) => WALL_SHOTS.includes(id)))];
  for (const id of ids) {
    const build = BUILDERS[id];
    if (build) sets.push(build(ctx, [id]));
  }
  const byShot = new Map<ShotId, StageSet>();
  for (const set of sets) for (const id of set.ids) byShot.set(id, set);
  return {
    sets,
    setFor(id) {
      const set = byShot.get(id);
      if (!set) throw new Error(`no set for shot "${id}"`);
      return set;
    },
    dispose() {
      sets.forEach((s) => s.dispose());
      mats.dispose();
    },
  };
}
