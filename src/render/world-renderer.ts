import { N8AOPostPass } from 'n8ao';
import {
  BloomEffect, DepthOfFieldEffect, EffectComposer, EffectPass, RenderPass, ToneMappingEffect, ToneMappingMode, VignetteEffect,
} from 'postprocessing';
import { HalfFloatType, NoToneMapping, PMREMGenerator, PerspectiveCamera, SRGBColorSpace, WebGLRenderer } from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { CameraPath } from '../camera/gallery-path';
import { EXPOSURE, type GalleryWorld as World } from '../stage/gallery/world';
import { FPS, type Sequence } from '../types';
import { GradeEffect } from './grade-effect';
import { aoIntensityFor, dofScaleAt, worldFadeAt } from './world-fades';

export interface MuseumRenderer {
  readonly canvas: HTMLCanvasElement;
  readonly width: number;
  readonly height: number;
  setSize(width: number, height: number): void;
  /** The only drawing entry point: preview and export both call this. */
  renderFrame(t: number): void;
  dispose(): void;
}

export interface WorldRendererOptions {
  canvas: HTMLCanvasElement;
  world: World;
  camera: CameraPath;
  sequence: Sequence;
}

export function createWorldRenderer(o: WorldRendererOptions): MuseumRenderer {
  const renderer = new WebGLRenderer({ canvas: o.canvas, antialias: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.toneMapping = NoToneMapping;
  renderer.outputColorSpace = SRGBColorSpace;

  const pmrem = new PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  o.world.scene.environment = environment;
  o.world.scene.environmentIntensity = 0.8 * EXPOSURE;

  const camera = new PerspectiveCamera(38, 16 / 9, 0.05, 500);
  // MSAA smooths geometry edges only; SMAA's colour edge detection also smeared the detail inside every photo.
  const composer = new EffectComposer(renderer, { frameBufferType: HalfFloatType, multisampling: 4 });
  composer.addPass(new RenderPass(o.world.scene, camera));
  const ao = new N8AOPostPass(o.world.scene, camera, 1280, 720);
  ao.configuration.aoRadius = 1.0;
  ao.configuration.distanceFalloff = 1.0;
  ao.configuration.intensity = 2.2;
  ao.setQualityMode('High');
  // See the v2 ruling: N8AO's copy quad must not depth-test against postprocessing's shared depth texture.
  const copyMaterial = (ao as unknown as { copyQuad: { material: { depthTest: boolean; depthWrite: boolean } } }).copyQuad.material;
  copyMaterial.depthTest = false;
  copyMaterial.depthWrite = false;
  composer.addPass(ao);
  // A deep field: only what is really near the lens (pillars, passers-by) blurs; walls and photos stay readable.
  const dof = new DepthOfFieldEffect(camera, { focusDistance: 7, focusRange: 7, bokehScale: 1.5 });
  const bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: 0.72, luminanceSmoothing: 0.25, intensity: 0.2 });
  const grade = new GradeEffect();
  composer.addPass(
    new EffectPass(
      camera,
      dof,
      bloom,
      new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL }),
      new VignetteEffect({ offset: 0.3, darkness: 0.55 }),
      grade,
    ),
  );

  let width = 0;
  let height = 0;
  function setSize(w: number, h: number): void {
    width = w;
    height = h;
    composer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function renderFrame(t: number): void {
    o.world.update(t);
    const pose = o.camera.poseAt(t);
    if (camera.fov !== pose.fov) {
      camera.fov = pose.fov;
      camera.updateProjectionMatrix();
    }
    camera.position.set(...pose.pos);
    camera.up.set(...(pose.up ?? [0, 1, 0]));
    camera.lookAt(...pose.target);
    dof.cocMaterial.focusDistance = pose.focus;
    dof.bokehScale = dofScaleAt(o.sequence, t);
    const glow = o.world.bloomAt(t, pose.pos[0]);
    bloom.intensity = glow;
    ao.configuration.intensity = aoIntensityFor(glow);
    grade.setState(worldFadeAt(o.sequence, t), Math.round(t * FPS));
    composer.render(1 / FPS);
  }

  setSize(1280, 720);
  return {
    canvas: o.canvas,
    get width() { return width; },
    get height() { return height; },
    setSize,
    renderFrame,
    dispose() {
      composer.dispose();
      environment.dispose();
      renderer.dispose();
    },
  };
}
