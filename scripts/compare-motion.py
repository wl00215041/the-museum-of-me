#!/usr/bin/env python3
"""Compares our film's motion with the original's over the sections of a table.

Usage: compare-motion.py ORIGINAL.csv OURS.csv TABLE.json REPORT.md
TABLE: [{"name": ..., "from": s, "to": s}, ...] in seconds (our 20-photo auto timeline matches the original's).
A section passes when
  - the median tx has the same sign in both films, or both stay below 20 px/s, and
  - the cumulative zoom differs by at most 25 % (or both stay within ±5 %).
Exit status 1 when any section fails.
"""
import csv
import json
import math
import sys


def load(path):
    rows = {}
    with open(path) as f:
        for r in csv.DictReader(f):
            rows[int(r['second'])] = (float(r['tx']), float(r['zoom']))
    return rows


def section(rows, a, b):
    tx = sorted(rows[s][0] for s in range(a, b) if s in rows and not math.isnan(rows[s][0]))
    zs = [rows[s][1] for s in range(a, b) if s in rows and not math.isnan(rows[s][1])]
    if not tx or not zs:
        return None
    zoom = math.exp(sum(math.log(z) for z in zs) * (b - a) / len(zs))
    return tx[len(tx) // 2], zoom


def verdict(o, u):
    if o is None or u is None:
        return False, 'no data'
    (otx, oz), (utx, uz) = o, u
    tx_ok = (abs(otx) < 20 and abs(utx) < 20) or otx * utx > 0
    small = lambda z: abs(math.log(z)) <= math.log(1.05)
    zoom_ok = (small(oz) and small(uz)) or abs(math.log(uz / oz)) <= math.log(1.25)
    notes = []
    if not tx_ok:
        notes.append('sideways motion differs')
    if not zoom_ok:
        notes.append('depth motion differs')
    return tx_ok and zoom_ok, ', '.join(notes)


def main():
    if len(sys.argv) != 5:
        print(__doc__, file=sys.stderr)
        return 2
    orig, ours = load(sys.argv[1]), load(sys.argv[2])
    with open(sys.argv[3]) as f:
        table = json.load(f)
    lines = ['| section | seconds | original tx | ours tx | original zoom | ours zoom | result |', '|---|---|---|---|---|---|---|']
    failed = 0
    for row in table:
        a, b = int(row['from']), int(row['to'])
        o, u = section(orig, a, b), section(ours, a, b)
        ok, why = verdict(o, u)
        failed += 0 if ok else 1
        cell = lambda v, k, f: '—' if v is None else format(v[k], f)
        result = 'pass' if ok else 'FAIL: ' + why
        lines.append(f"| {row['name']} | {a}–{b} | {cell(o, 0, '.0f')} | {cell(u, 0, '.0f')} | {cell(o, 1, '.2f')} | {cell(u, 1, '.2f')} | {result} |")
    with open(sys.argv[4], 'w') as f:
        f.write('\n'.join(lines) + '\n')
    print('\n'.join(lines))
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
