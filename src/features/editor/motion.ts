import type { PlacedItem, Polygon } from '../../types/geometry';

/** The first path node that touches a piece's outline. */
export interface Visit { node: number; piece: number }
export interface Motion { visits: Visit[]; pieceAt: Int32Array }

const key = (x: number, y: number) => `${x.toFixed(2)} ${y.toFixed(2)}`;

/** Works out which piece the wire is on at each node, from the vertices the path shares with the outlines. */
export function pieceVisits(path: Polygon, items: PlacedItem[]): Motion {
  const owner = new Map<string, number>();
  items.forEach((it, i) => {
    for (const c of [...it.outers, ...it.holes]) for (const q of c) owner.set(key(q[0], q[1]), i);
  });
  const pieceAt = new Int32Array(path.length).fill(-1), seen = new Set<number>(), visits: Visit[] = [];
  let current = -1;
  path.forEach((q, node) => {
    current = owner.get(key(q[0], q[1])) ?? current;
    pieceAt[node] = current;
    if (current >= 0 && !seen.has(current)) { seen.add(current); visits.push({ node, piece: current }); }
  });
  return { visits, pieceAt };
}

/** The path node the wire has reached, or last passed, at `distance`. */
export function nodeAt(cumulative: number[], distance: number): number {
  let lo = 0, hi = cumulative.length - 1;
  if (hi < 0) return 0;
  if (distance >= cumulative[hi]) return hi;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cumulative[m] <= distance) lo = m; else hi = m; }
  return lo;
}
