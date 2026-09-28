#!/usr/bin/env python3
"""Per-second camera motion of a letterboxed film.

Usage: measure-motion.py VIDEO OUT.csv [--end SECONDS] [--rate SAMPLES_PER_SECOND]

One row per whole second: second,tx,ty,zoom,rot,inliers
  tx, ty  median feature flow in px/s at 720 lines (tx < 0: the picture moves left,
          i.e. the camera trucks or pans right)
  zoom    per-second scale change of the picture (> 1: the camera moves in)
  rot     median in-plane rotation, degrees per second
Seconds without a single matched sample are written as NaN.
"""
import argparse
import math
import sys

import cv2
import numpy as np


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('video')
    ap.add_argument('out')
    ap.add_argument('--end', type=float, default=1e9)
    ap.add_argument('--rate', type=float, default=10.0)
    args = ap.parse_args()

    cap = cv2.VideoCapture(args.video)
    if not cap.isOpened():
        print(f'cannot open {args.video}', file=sys.stderr)
        return 2
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    step = max(1, round(fps / args.rate))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    # Inside the 2.35:1 letterbox, clear of its edges.
    y0, y1 = int(height * 0.19), int(height * 0.81)
    px = 720.0 / height
    per_second = fps / step

    orb = cv2.ORB_create(3000)
    matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
    clahe = cv2.createCLAHE(3.0, (8, 8))
    samples = []  # (t, scale or nan, tx, ty, rot, inliers)
    prev = None
    index = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        t = index / fps
        if t > args.end:
            break
        if index % step == 0:
            gray = clahe.apply(cv2.cvtColor(frame[y0:y1], cv2.COLOR_BGR2GRAY))
            kp, des = orb.detectAndCompute(gray, None)
            row = (t, math.nan, math.nan, math.nan, math.nan, 0)
            if prev is not None and des is not None and prev[1] is not None and len(kp) >= 20:
                matches = matcher.match(prev[1], des)
                if len(matches) >= 20:
                    a = np.float32([prev[0][m.queryIdx].pt for m in matches])
                    b = np.float32([kp[m.trainIdx].pt for m in matches])
                    M, inliers = cv2.estimateAffinePartial2D(a, b, method=cv2.RANSAC, ransacReprojThreshold=2.0)
                    if M is not None and int(inliers.sum()) >= 15:
                        s = math.hypot(M[0, 0], M[1, 0])
                        rot = math.degrees(math.atan2(M[1, 0], M[0, 0]))
                        row = (t, s, M[0, 2] * px * per_second, M[1, 2] * px * per_second, rot * per_second, int(inliers.sum()))
            if prev is not None:
                samples.append(row)
            prev = (kp, des)
        index += 1

    with open(args.out, 'w') as out:
        out.write('second,tx,ty,zoom,rot,inliers\n')
        if samples:
            for sec in range(int(samples[-1][0]) + 1):
                rows = [r for r in samples if sec <= r[0] < sec + 1 and not math.isnan(r[1])]
                if not rows:
                    out.write(f'{sec},nan,nan,nan,nan,0\n')
                    continue
                zoom = math.exp(sum(math.log(r[1]) for r in rows) / len(rows) * per_second)
                med = lambda k: float(np.median([r[k] for r in rows]))
                out.write(f'{sec},{med(2):.2f},{med(3):.2f},{zoom:.5f},{med(4):.3f},{int(med(5))}\n')
    return 0


if __name__ == '__main__':
    sys.exit(main())
