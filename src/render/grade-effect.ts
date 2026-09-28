import { Effect } from 'postprocessing';
import { Uniform, Vector3 } from 'three';
import type { Fade } from './world-fades';

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

vec3 toSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

vec3 toLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  // Effects run in linear light and are encoded to sRGB at the end; grading happens in display space.
  vec3 s = toSrgb(clamp(inputColor.rgb, 0.0, 1.0));
  float l = dot(s, vec3(0.2126, 0.7152, 0.0722));
  s = mix(vec3(l), s, saturation);
  s = s * (1.0 - lift) + lift;
  s += (hash(gl_FragCoord.xy + seed) - 0.5) * grainAmount * (0.25 + 0.75 * l);
  vec3 c = toLinear(clamp(s, 0.0, 1.0));
  c = mix(c, fadeColor, fadeAmount);
  if (abs(uv.y - 0.5) > letterbox) c = vec3(0.0);
  outputColor = vec4(c, 1.0); // video frames are always opaque
}
`;

/** Desaturation, a slight black lift and luminance-weighted grain in sRGB, fades and the 2.35:1 letterbox. */
export class GradeEffect extends Effect {
  constructor() {
    super('GradeEffect', fragmentShader, {
      uniforms: new Map<string, Uniform>([
        ['fadeColor', new Uniform(new Vector3(1, 1, 1))],
        ['fadeAmount', new Uniform(0)],
        ['grainAmount', new Uniform(0.03)],
        ['seed', new Uniform(0)],
        ['letterbox', new Uniform(LETTERBOX_HALF)],
        ['saturation', new Uniform(0.88)],
        ['lift', new Uniform(0.012)],
      ]),
    });
  }

  setState(fade: Fade, frame: number): void {
    (this.uniforms.get('fadeColor')!.value as Vector3).setScalar(fade.white ? 1 : 0);
    this.uniforms.get('fadeAmount')!.value = fade.amount;
    this.uniforms.get('seed')!.value = (frame % 997) * 1.618;
  }
}
