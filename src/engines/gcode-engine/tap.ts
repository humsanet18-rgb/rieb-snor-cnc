import type { Point, Polygon } from '../../types/geometry';

export interface TapOptions { name: string; feed: number; power: number; m5: boolean; date: string }

/** Writes the same line layout FCNC produces, so Mach3 reads it the same way. CRLF, ASCII only. */
/** Index of the line holding the path's first move: name, blank, F, M3, blank. */
export const TAP_FIRST_MOVE = 5;

export function toTAP(path: Polygon, o: TapOptions): string {
  const pad = (s: string, n: number) => (s + '          ').slice(0, Math.max(n, s.length));
  const nStr = (n: number) => ('00000' + n).slice(-Math.max(5, String(n).length));
  const body: string[] = [];
  let n = 20;
  for (const q of path) {
    const x = q[0].toFixed(2);
    body.push(`N${nStr(n)} G1 X${x.length < 7 ? pad(x, 7) : x + ' '}Y${q[1].toFixed(2)} `);
    n += 10;
  }
  const tail: string[] = [];
  if (o.m5) { tail.push(`N${nStr(n)} M5`); n += 10; }
  tail.push(`N${nStr(n)}           `);
  const name = String(o.name || 'sheet').replace(/[^\x20-\x7e]/g, '').replace(/[()]/g, '');
  const lines = body.length + tail.length + 5;
  return [`('${name}'. ${lines} lines of G-Code created on ${o.date || ''} by FoamNest.)`, ' ',
    `N00000 F${o.feed}`, `N00010 M3 S${o.power}`, ' ']
    .concat(body, tail, ['(EOF)', '']).join('\r\n');
}

export type TapErrorCode =
  | 'bad-line' | 'line-order' | 'duplicate-line' | 'missing-feed' | 'missing-spindle' | 'missing-eof'
  | 'duplicate-move' | 'bad-header' | 'non-ascii' | 'line-count' | 'content-after-eof';

export interface TapError { code: TapErrorCode; line: number; text?: string }
export interface ParsedTap { feed: number | null; power: number | null; m5: boolean; moves: Point[]; errors: TapError[] }

const MOVE = /^N(\d{5,}) G1 X(-?\d+\.\d{2})\s+Y(-?\d+\.\d{2}) $/;

/** Reads a TAP back from text alone, so export checks do not trust the code that wrote the file. */
export function parseTap(text: string): ParsedTap {
  const out: ParsedTap = { feed: null, power: null, m5: false, moves: [], errors: [] };
  const fail = (code: TapErrorCode, line: number, t?: string) => out.errors.push({ code, line, text: t?.slice(0, 60) });
  if (/[^\x00-\x7f]/.test(text)) fail('non-ascii', 0);
  const lines = text.split('\r\n');
  if (lines[lines.length - 1] === '') lines.pop();
  const head = /^\('.*'\. (\d+) lines of G-Code created on .* by FoamNest\.\)$/.exec(lines[0] || '');
  if (!head) fail('bad-header', 1, lines[0]);
  else if (+head[1] !== lines.length - 1) fail('line-count', 1, `${head[1]} vs ${lines.length - 1}`);
  let lastN = -1, ended = false;
  const number = (n: number, i: number) => {
    if (n === lastN) fail('duplicate-line', i + 1);
    else if (n < lastN || (lastN >= 0 && n !== lastN + 10)) fail('line-order', i + 1);
    lastN = n;
  };
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i];
    if (ended) { fail('content-after-eof', i + 1, l); continue; }
    if (l === ' ') continue;
    if (l === '(EOF)') { ended = true; continue; }
    let m: RegExpExecArray | null;
    if ((m = MOVE.exec(l))) {
      number(+m[1], i);
      const q: Point = [+m[2], +m[3]], p = out.moves[out.moves.length - 1];
      if (p && p[0] === q[0] && p[1] === q[1]) fail('duplicate-move', i + 1, l);
      out.moves.push(q);
    } else if ((m = /^N(\d{5,}) F(\d+(?:\.\d+)?)$/.exec(l))) { number(+m[1], i); out.feed = +m[2]; }
    else if ((m = /^N(\d{5,}) M3 S(\d+(?:\.\d+)?)$/.exec(l))) { number(+m[1], i); out.power = +m[2]; }
    else if ((m = /^N(\d{5,}) M5$/.exec(l))) { number(+m[1], i); out.m5 = true; }
    else if ((m = /^N(\d{5,}) *$/.exec(l))) number(+m[1], i);
    else fail('bad-line', i + 1, l);
  }
  if (out.feed === null) fail('missing-feed', 0);
  if (out.power === null) fail('missing-spindle', 0);
  if (!ended) fail('missing-eof', lines.length);
  return out;
}
