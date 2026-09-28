import { Effect } from 'postprocessing';
import { Uniform, Vector3 } from 'three';
import type { Fade } from './transitions';

/** Half the visible band height (in uv) for 2.35:1 inside 16:9. */
export const LETTERBOX_HALF = 16 / 9 / 2.35 / 2;

const fragmentShader = /* glsl */ `
uniform vec3 fadeColor;
uniform float fadeAmount;
uniform float grainAmount;
uniform float seed;
uniform float letterbox;
uniform float saturation;
uniform float lift;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = inputColor.rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, saturation);
  c = c * (1.0 - lift) + lift;
  c += (hash(gl_FragCoord.xy + seed) - 0.5) * grainAmount;
  c = mix(c, fadeColor, fadeAmount);
  if (abs(uv.y - 0.5) > letterbox) c = vec3(0.0);
  outputColor = vec4(c, 1.0); // video frames are always opaque
}
`;

/** Desaturation, lifted blacks, film grain, dips to black/white and the 2.35:1 letterbox. */
export class GradeEffect extends Effect {
  constructor() {
    super('GradeEffect', fragmentShader, {
      uniforms: new Map<string, Uniform>([
        ['fadeColor', new Uniform(new Vector3(1, 1, 1))],
        ['fadeAmount', new Uniform(0)],
        ['grainAmount', new Uniform(0.035)],
        ['seed', new Uniform(0)],
        ['letterbox', new Uniform(LETTERBOX_HALF)],
        ['saturation', new Uniform(0.8)],
        ['lift', new Uniform(0.02)],
      ]),
    });
  }

  setState(fade: Fade, frame: number): void {
    (this.uniforms.get('fadeColor')!.value as Vector3).setScalar(fade.white ? 1 : 0);
    this.uniforms.get('fadeAmount')!.value = fade.amount;
    this.uniforms.get('seed')!.value = (frame % 997) * 1.618;
  }
}
