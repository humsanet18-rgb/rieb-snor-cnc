import type { BBox, Part, Point, Polygon } from '../../types/geometry';
import { bboxOf, pointInPoly, polyArea, segCross } from './geometry';

export function cleanPoly(p: Polygon): Polygon {
  const out: Polygon = [];
  for (const q of p) {
    const l = out[out.length - 1];
    if (!l || Math.hypot(q[0] - l[0], q[1] - l[1]) > 0.01) out.push(q);
  }
  while (out.length > 1 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= 0.01) out.pop();
  return out;
}

interface Contour { pts: Polygon; area: number; bbox: BBox; parent: number; depth: number }

function contoursCross(A: Contour, B: Contour): boolean {
  const ba = A.bbox, bb = B.bbox;
  const x0 = Math.max(ba.x0, bb.x0), x1 = Math.min(ba.x1, bb.x1), y0 = Math.max(ba.y0, bb.y0), y1 = Math.min(ba.y1, bb.y1);
  if (x0 > x1 || y0 > y1) return false;
  const pick = (P: Polygon) => {
    const s: [Point, Point][] = [];
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length];
      if (Math.max(a[0], b[0]) >= x0 && Math.min(a[0], b[0]) <= x1 && Math.max(a[1], b[1]) >= y0 && Math.min(a[1], b[1]) <= y1) s.push([a, b]);
    }
    return s;
  };
  const sa = pick(A.pts), sb = pick(B.pts);
  for (const p of sa) for (const q of sb) {
    if (Math.max(p[0][0], p[1][0]) < Math.min(q[0][0], q[1][0]) || Math.max(q[0][0], q[1][0]) < Math.min(p[0][0], p[1][0])) continue;
    if (segCross(p[0], p[1], q[0], q[1])) return true;
  }
  return false;
}

export interface BuildResult { parts: Part[]; tiny: number; dupes: number; overlaps: number }

/** Groups raw contours into pieces: even containment depth is material, odd depth is a hole. */
export function buildParts(polys: Polygon[]): BuildResult {
  const list: Contour[] = [];
  let tiny = 0, dupes = 0;
  const seen = new Set<string>();
  for (const raw of polys) {
    const pts = cleanPoly(raw);
    if (pts.length < 3) continue;
    const area = Math.abs(polyArea(pts));
    if (area < 1) { tiny++; continue; }
    const bbox = bboxOf(pts);
    const key = [bbox.x0, bbox.y0, bbox.x1, bbox.y1, area].map(v => Math.round(v * 2)).join('|');
    if (seen.has(key)) { dupes++; continue; }
    seen.add(key);
    list.push({ pts, area, bbox, parent: -1, depth: 0 });
  }
  list.sort((a, b) => b.area - a.area);
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    for (let j = i - 1; j >= 0; j--) { // smallest enclosing contour first
      const p = list[j], b = p.bbox;
      if (c.bbox.x0 < b.x0 || c.bbox.x1 > b.x1 || c.bbox.y0 < b.y0 || c.bbox.y1 > b.y1) continue;
      if (pointInPoly(c.pts[0], p.pts)) { c.parent = j; c.depth = p.depth + 1; break; }
    }
  }
  // Overlapping (not welded) contours must stay together as one piece.
  const uf = list.map((_, i) => i);
  const find = (i: number): number => { while (uf[i] !== i) i = uf[i] = uf[uf[i]]; return i; };
  let overlaps = 0;
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    if (contoursCross(list[i], list[j])) {
      overlaps++;
      const a = list[i].depth % 2 ? list[i].parent : i, b = list[j].depth % 2 ? list[j].parent : j;
      uf[find(a)] = find(b);
    }
  }
  const byRoot = new Map<number, { contours: Polygon[]; holes: Polygon[] }>();
  list.forEach((c, i) => {
    if (c.depth % 2 === 0) {
      const r = find(i);
      if (!byRoot.has(r)) byRoot.set(r, { contours: [], holes: [] });
      byRoot.get(r)!.contours.push(c.pts);
    }
  });
  list.forEach(c => {
    if (c.depth % 2 === 1) byRoot.get(find(c.parent))!.holes.push(c.pts);
  });
  const parts: Part[] = [];
  for (const g of byRoot.values()) {
    const bbox = bboxOf(g.contours.flat());
    const area = g.contours.reduce((s, p) => s + Math.abs(polyArea(p)), 0) - g.holes.reduce((s, p) => s + Math.abs(polyArea(p)), 0);
    parts.push({ outers: g.contours, holes: g.holes, area, bbox });
  }
  return { parts, tiny, dupes, overlaps };
}
