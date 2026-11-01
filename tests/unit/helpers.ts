import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { buildParts } from '../../src/engines/geometry-engine/parts';
import { parseSvg } from '../../src/engines/svg-parser/parse-svg';
import type { Part, PlacedItem, Polygon } from '../../src/types/geometry';

/** The original single-file engine, kept unchanged as the known-good reference. */
export const legacy = createRequire(import.meta.url)('../fixtures/legacy-engine.cjs');

export const fixture = (name: string) => resolve(__dirname, '..', 'fixtures', name);
export const samplesDir = resolve(__dirname, '..', '..', 'public', 'samples');
export const readSample = (name: string) => readFileSync(resolve(samplesDir, name), 'utf8');

/** Customer files live outside the repository history; their tests skip when absent. */
export const privateFile = (name: string) => {
  const p = fixture('private/' + name);
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
};

export const svgDoc = (body: string, attrs = 'width="100mm" height="100mm" viewBox="0 0 100 100"') =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ${attrs}>${body}</svg>`;

export const partsOf = (text: string): Part[] => buildParts(parseSvg(text).shapes).parts;

export function box(x: number, y: number, w: number, h: number): Polygon {
  return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
}

export function rectPart(w: number, h: number, x = 0, y = 0): Part {
  return { outers: [box(x, y, w, h)], holes: [], area: w * h, bbox: { x0: x, y0: y, x1: x + w, y1: y + h } };
}

export const placed = (p: Part): PlacedItem => ({ outers: p.outers, holes: p.holes, area: p.area });
