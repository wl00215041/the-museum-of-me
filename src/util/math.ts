export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const u = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return u * u * (3 - 2 * u);
}
