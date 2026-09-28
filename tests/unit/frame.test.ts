import { Object3D, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { curve, integral } from '../../src/camera/curve';
import { child, dirOf, dot, placeIn, rightOf, toLocal, toLocalDir, toWorld, toWorldDir, yawOf, type Frame } from '../../src/stage/frame';
import type { Vec3 } from '../../src/types';

const close = (a: Vec3, b: Vec3, digits = 9) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], digits));

describe('frame', () => {
  const f: Frame = { origin: [3, 0.5, -2], yaw: 0.7 };

  it('yaw 0 looks along −z; positive yaw turns right', () => {
    close(dirOf(0), [0, 0, -1]);
    close(rightOf(0), [1, 0, 0]);
    close(dirOf(Math.PI / 2), [1, 0, 0]);
    expect(dot(dirOf(0.3), rightOf(0.3))).toBeCloseTo(0, 12);
  });

  it('local −z is the view direction and local +x the right hand', () => {
    close(toWorldDir(f, [0, 0, -1]), dirOf(f.yaw));
    close(toWorldDir(f, [1, 0, 0]), rightOf(f.yaw));
  });

  it('round-trips local ↔ world', () => {
    const p: Vec3 = [1.5, 2, -4];
    close(toLocal(f, toWorld(f, p)), p);
    close(toLocalDir(f, toWorldDir(f, p)), p);
  });

  it('placeIn gives three.js the same transform as toWorld', () => {
    const o = placeIn(f, new Object3D());
    o.updateMatrixWorld();
    const p = new Vector3(1, 2, 3).applyMatrix4(o.matrixWorld);
    close(p.toArray() as Vec3, toWorld(f, [1, 2, 3]));
  });

  it('yawOf inverts dirOf, and child frames compose', () => {
    expect(yawOf(dirOf(-1.2))).toBeCloseTo(-1.2, 12);
    const c = child(f, [2, 0, 0], 0.4);
    expect(c.yaw).toBeCloseTo(1.1, 12);
    close(c.origin, toWorld(f, [2, 0, 0]));
  });
});

describe('curve', () => {
  it('passes through its keys with the given slopes', () => {
    const c = curve([{ t: 0, v: 1, slope: 0 }, { t: 2, v: 3 }, { t: 4, v: 2, slope: 0 }]);
    expect(c.at(0)).toBe(1);
    expect(c.at(2)).toBeCloseTo(3, 12);
    expect(c.at(9)).toBeCloseTo(2, 12);
    expect((c.at(1e-6) - c.at(0)) / 1e-6).toBeCloseTo(0, 3);
  });

  it('integral of a constant grows linearly and clamps outside', () => {
    const x = integral(() => 2, 1, 5);
    expect(x.at(1)).toBe(0);
    expect(x.at(3)).toBeCloseTo(4, 9);
    expect(x.at(9)).toBeCloseTo(8, 9);
    expect(x.at(0)).toBe(0);
  });
});
