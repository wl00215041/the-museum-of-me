import { Effect } from 'postprocessing';
import { Uniform, type Texture } from 'three';

const fragmentShader = /* glsl */ `
uniform float white;
uniform float cardOpacity;
uniform sampler2D card;
uniform float grainAmount;
uniform float seed;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = inputColor.rgb;
  c += (hash(gl_FragCoord.xy + seed) - 0.5) * grainAmount;
  c = mix(c, vec3(1.0), white);
  vec4 k = texture2D(card, uv);
  c = mix(c, k.rgb, k.a * cardOpacity);
  outputColor = vec4(c, 1.0); // video frames are always opaque
}
`;

/** Film grain, white fades and the end card, composited after tone mapping. */
export class FinishEffect extends Effect {
  constructor(card: Texture) {
    super('FinishEffect', fragmentShader, {
      uniforms: new Map<string, Uniform>([
        ['white', new Uniform(0)],
        ['cardOpacity', new Uniform(0)],
        ['card', new Uniform(card)],
        ['grainAmount', new Uniform(0.035)],
        ['seed', new Uniform(0)],
      ]),
    });
  }

  /** `frame` seeds the grain so identical frames render identically. */
  setState(white: number, card: number, frame: number): void {
    this.uniforms.get('white')!.value = white;
    this.uniforms.get('cardOpacity')!.value = card;
    this.uniforms.get('seed')!.value = (frame % 997) * 1.618;
  }
}
