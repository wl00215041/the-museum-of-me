import { N8AOPostPass } from 'n8ao';
import {
  BloomEffect, EffectComposer, EffectPass, RenderPass, SMAAEffect, SMAAPreset, ToneMappingEffect, ToneMappingMode, VignetteEffect,
} from 'postprocessing';
import { HalfFloatType, NoToneMapping, PMREMGenerator, PerspectiveCamera, SRGBColorSpace, WebGLRenderer } from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { ShotPath } from '../camera/shots';
import { shotIndexAt } from '../plan/storyboard';
import type { Stage } from '../stage/build';
import { FPS, type Storyboard } from '../types';
import { GradeEffect } from './grade-effect';
import { fadeAt } from './transitions';

export interface MuseumRenderer {
  readonly canvas: HTMLCanvasElement;
  readonly width: number;
  readonly height: number;
  setSize(width: number, height: number): void;
  /** The only drawing entry point: preview and export both call this. */
  renderFrame(t: number): void;
  dispose(): void;
}

export interface StageRendererOptions {
  canvas: HTMLCanvasElement;
  stage: Stage;
  camera: ShotPath;
  storyboard: Storyboard;
}

export function createStageRenderer(o: StageRendererOptions): MuseumRenderer {
  const renderer = new WebGLRenderer({
    canvas: o.canvas,
    antialias: false,
    stencil: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: true, // lets the encoder and tests read the canvas after a frame
  });
  renderer.setPixelRatio(1);
  renderer.toneMapping = NoToneMapping; // tone mapping happens in the effect pass
  renderer.outputColorSpace = SRGBColorSpace;

  const pmrem = new PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  for (const set of o.stage.sets) {
    if (set.dark) continue;
    set.scene.environment = environment;
    set.scene.environmentIntensity = 0.8;
  }

  const camera = new PerspectiveCamera(40, 16 / 9, 0.05, 500);
  let current = o.stage.sets[0].scene;
  const composer = new EffectComposer(renderer, { frameBufferType: HalfFloatType });
  const renderPass = new RenderPass(current, camera);
  composer.addPass(renderPass);
  const ao = new N8AOPostPass(current, camera, 1280, 720);
  ao.configuration.aoRadius = 1.0;
  ao.configuration.distanceFalloff = 1.0;
  ao.configuration.intensity = 2.2;
  ao.setQualityMode('High');
  // N8AO copies its result into outputBuffer with a depth-tested quad; postprocessing's buffers share the
  // scene depth texture, so the copy is rejected and the next pass reads black. Disable the depth test.
  const copyMaterial = (ao as unknown as { copyQuad: { material: { depthTest: boolean; depthWrite: boolean } } }).copyQuad.material;
  copyMaterial.depthTest = false;
  copyMaterial.depthWrite = false;
  composer.addPass(ao);
  const bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: 0.72, luminanceSmoothing: 0.25, intensity: 0.2 });
  const grade = new GradeEffect();
  composer.addPass(
    new EffectPass(
      camera,
      new SMAAEffect({ preset: SMAAPreset.HIGH }),
      bloom,
      new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL }),
      new VignetteEffect({ offset: 0.35, darkness: 0.45 }),
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
    const shot = o.storyboard.shots[shotIndexAt(o.storyboard, t)];
    const set = o.stage.setFor(shot.id);
    if (set.scene !== current) {
      current = set.scene;
      renderPass.mainScene = current;
      ao.scene = current;
    }
    set.update(t);
    const pose = o.camera.poseAt(t);
    if (camera.fov !== pose.fov) {
      camera.fov = pose.fov;
      camera.updateProjectionMatrix();
    }
    camera.position.set(...pose.pos);
    camera.lookAt(...pose.target);
    bloom.intensity = set.bloom ?? (set.dark ? 1.1 : 0.2);
    ao.configuration.intensity = set.dark ? 1.0 : 2.2;
    grade.setState(fadeAt(o.storyboard, t), Math.round(t * FPS));
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
