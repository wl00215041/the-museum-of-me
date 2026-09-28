declare module 'n8ao' {
  import type { Camera, Scene } from 'three';
  import { Pass } from 'postprocessing';

  export class N8AOPostPass extends Pass {
    constructor(scene: Scene, camera: Camera, width?: number, height?: number);
    /** The scene whose depth/normals are sampled; swapped together with the render pass. */
    scene: Scene;
    configuration: {
      aoRadius: number;
      distanceFalloff: number;
      intensity: number;
      gammaCorrection: boolean;
      halfRes: boolean;
      [key: string]: unknown;
    };
    setQualityMode(mode: 'Performance' | 'Low' | 'Medium' | 'High' | 'Ultra'): void;
  }
}
