import { BoxGeometry, Color, Group, HemisphereLight, Mesh, PlaneGeometry, Scene } from 'three';
import type { StageTextureFactory } from '../../assets/texture-factory';
import type { Vec3 } from '../../types';
import type { VisitorSpot } from '../layout';
import type { StageMaterials } from '../parts/materials';
import { createTextPlane } from '../parts/text-plane';
import { createVisitor } from '../parts/visitor';

export function whiteScene(color: number): Scene {
  const scene = new Scene();
  scene.background = new Color(color);
  return scene;
}

export function darkScene(): Scene {
  const scene = new Scene();
  scene.background = new Color(0x050505);
  scene.add(new HemisphereLight(0x404040, 0x000000, 0.35));
  return scene;
}

/** Dark reflective floor in front of z = 0 and a black back wall just behind it. */
export function addDarkRoom(scene: Scene, mats: StageMaterials, width: number, depth: number): void {
  const floor = new Mesh(new PlaneGeometry(width, depth), mats.darkFloor);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, depth / 2 - 1);
  const back = new Mesh(new PlaneGeometry(width, 9), mats.darkWall);
  back.position.set(0, 4.5, -0.4);
  scene.add(floor, back);
}

export function addVisitors(scene: Scene, spots: VisitorSpot[], mats: StageMaterials): void {
  for (const spot of spots) scene.add(createVisitor(spot, mats.visitor));
}

/** The small room label the original hangs before each section ("Friends 1", "Photos 2"). */
export function createPlaque(tex: StageTextureFactory, label: string, number: number, at: Vec3, mats: StageMaterials): Group {
  const group = new Group();
  group.name = `plaque:${label}`;
  const backing = new Mesh(new BoxGeometry(0.42, 0.5, 0.015), mats.plaque);
  backing.position.z = 0.0075;
  const text = createTextPlane(
    tex.text({
      size: { width: 420, height: 500 },
      align: 'left',
      padding: 36,
      color: '#2a2a2a',
      lines: [
        { text: '■', px: 44, weight: 500 },
        { text: label, px: 44, weight: 500, family: 'grotesk' },
        { text: String(number), px: 36, weight: 500, family: 'grotesk' },
      ],
    }),
    0.4,
    0.48,
  );
  text.position.z = 0.016;
  group.add(backing, text);
  group.position.set(...at);
  return group;
}
