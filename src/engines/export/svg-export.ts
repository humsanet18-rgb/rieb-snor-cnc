import type { PlacedItem, Polygon, Rect } from '../../types/geometry';

/** CorelDRAW-style sheet SVG in cm, so it can be edited there and imported back with "keep position". */
export function toSVG(items: PlacedItem[], sheetW: number, sheetH: number, startBox: Rect | null): string {
  const f = (v: number) => (v / 10).toFixed(5);
  const d = (P: Polygon) => 'M' + P.map(q => f(q[0]) + ' ' + f(q[1])).join('L') + 'z';
  const paths = items.map(it => `  <path class="fil0" d="${it.outers.concat(it.holes).map(d).join('')}"/>`);
  if (startBox) paths.push(`  <rect class="fil1 str0" x="${f(startBox.x)}" y="${f(startBox.y)}" width="${f(startBox.w)}" height="${f(startBox.h)}"/>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xml:space="preserve" width="${sheetW / 10}cm" height="${sheetH / 10}cm" version="1.1" style="fill-rule:evenodd; clip-rule:evenodd" viewBox="0 0 ${sheetW / 10} ${sheetH / 10}">\n <defs>\n  <style type="text/css">\n   <![CDATA[\n    .str0 {stroke:#373435;stroke-width:0.01764;stroke-miterlimit:2.61313}\n    .fil1 {fill:none}\n    .fil0 {fill:#373435;fill-rule:evenodd}\n   ]]>\n  </style>\n </defs>\n <g id="Layer_x0020_1">\n${paths.join('\n')}\n </g>\n</svg>\n`;
}
