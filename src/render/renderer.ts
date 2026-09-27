import { N8AOPostPass } from 'n8ao';
import { EffectComposer, EffectPass, RenderPass, SMAAEffect, SMAAPreset, ToneMappingEffect, ToneMappingMode, VignetteEffect } from 'postprocessing';
import { HalfFloatType, NoToneMapping, PMREMGenerator, PerspectiveCamera, SRGBColorSpace, WebGLRenderer, type Texture } from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { CameraPath } from '../camera/hermite';
import type { MuseumScene } from '../museum/build';
import { FPS } from '../types';
import { fadesAt } from './fades';
import { FinishEffect } from './finish-effect';

export interface MuseumRenderer {
  readonly canvas: HTMLCanvasElement;
  readonly width: number;
  readonly height: number;
  setSize(width: number, height: number): void;
  /** The only drawing entry point: preview and export both call this. */
  renderFrame(t: number): void;
  dispose(): void;
}

export interface RendererOptions {
  canvas: HTMLCanvasElement;
  museum: MuseumScene;
  camera: CameraPath;
  total: number;
  endCard: Texture;
}

export function createRenderer(o: RendererOptions): MuseumRenderer {
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
  o.museum.scene.environment = environment;
  o.museum.scene.environmentIntensity = 0.85;

  const camera = new PerspectiveCamera(45, 16 / 9, 0.1, 400);
  const composer = new EffectComposer(renderer, { frameBufferType: HalfFloatType });
  composer.addPass(new RenderPass(o.museum.scene, camera));
  const ao = new N8AOPostPass(o.museum.scene, camera, 1280, 720);
  ao.configuration.aoRadius = 1.2;
  ao.configuration.distanceFalloff = 1.0;
  ao.configuration.intensity = 2.4;
  ao.setQualityMode('High');
  // N8AO copies its result into outputBuffer with a depth-tested quad; postprocessing's buffers share the
  // scene depth texture, so the copy is rejected and the next pass reads black. Disable the depth test.
  const copyMaterial = (ao as unknown as { copyQuad: { material: { depthTest: boolean; depthWrite: boolean } } }).copyQuad.material;
  copyMaterial.depthTest = false;
  copyMaterial.depthWrite = false;
  composer.addPass(ao);
  const finish = new FinishEffect(o.endCard);
  composer.addPass(
    new EffectPass(
      camera,
      new SMAAEffect({ preset: SMAAPreset.HIGH }),
      new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL }),
      new VignetteEffect({ offset: 0.35, darkness: 0.4 }),
      finish,
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
    o.museum.update(t);
    const pose = o.camera.poseAt(t);
    camera.position.set(...pose.pos);
    camera.lookAt(...pose.target);
    const fades = fadesAt(t, o.total);
    finish.setState(fades.white, fades.card, Math.round(t * FPS));
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
