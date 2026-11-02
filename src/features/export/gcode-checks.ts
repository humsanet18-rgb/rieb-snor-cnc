import { parseTap, TAP_FIRST_MOVE } from '../../engines/gcode-engine/tap';
import type { BBox } from '../../types/geometry';

export type CheckId = 'syntax' | 'feed' | 'power' | 'wire-off' | 'path-end' | 'sheet-bounds' | 'machine-bounds' | 'validation';
export type CheckStatus = 'pass' | 'fail' | 'warn' | 'info';

export interface GcodeCheck { id: CheckId; status: CheckStatus; detail?: string; line?: number }

export interface TapContext {
  sheetW: number; sheetH: number;
  /** Machine travel; null when the profile does not say. */
  maxX: number | null; maxY: number | null;
  feed: number; power: number; m5: boolean;
  /** The path should end where it started (shortest order, or "return home" ticked). */
  returnHome: boolean;
  /** Errors the toolpath validation already found for this sheet. */
  blocking: number;
}

export interface TapReport { checks: GcodeCheck[]; ok: boolean; moves: number; lines: number; extent: BBox | null }

const TOL = 0.011; // the file holds two decimals

/**
 * Reads the file text back on its own and checks it before it may be downloaded:
 * that Mach3 can read it, that F/S/M5 are what the profile says, and that every move
 * stays on the sheet and inside the machine.
 */
export function checkTap(text: string, c: TapContext): TapReport {
  const parsed = parseTap(text), checks: GcodeCheck[] = [], moves = parsed.moves;
  const lines = text.split('\r\n').length - (text.endsWith('\r\n') ? 1 : 0);
  const first = parsed.errors[0];
  checks.push(first ? { id: 'syntax', status: 'fail', detail: `${first.code}${parsed.errors.length > 1 ? ` (+${parsed.errors.length - 1})` : ''}`, line: first.line || undefined } : { id: 'syntax', status: 'pass' });

  const feedOk = parsed.feed !== null && parsed.feed > 0 && parsed.feed === c.feed;
  checks.push({ id: 'feed', status: feedOk ? 'pass' : 'fail', detail: `F${parsed.feed ?? '—'}` });
  // The validator allows S0, but a cold wire cuts nothing, so it is worth a second look.
  const powerOk = parsed.power !== null && parsed.power === c.power;
  checks.push({ id: 'power', status: !powerOk ? 'fail' : parsed.power === 0 ? 'warn' : 'pass', detail: `S${parsed.power ?? '—'}` });
  checks.push({ id: 'wire-off', status: parsed.m5 !== c.m5 ? 'fail' : c.m5 ? 'pass' : 'info' });

  let extent: BBox | null = null;
  if (moves.length) {
    extent = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const [x, y] of moves) {
      if (x < extent.x0) extent.x0 = x; if (x > extent.x1) extent.x1 = x;
      if (y < extent.y0) extent.y0 = y; if (y > extent.y1) extent.y1 = y;
    }
    const a = moves[0], b = moves[moves.length - 1], home = Math.hypot(a[0] - b[0], a[1] - b[1]) <= TOL * 2;
    checks.push({ id: 'path-end', status: home ? 'pass' : c.returnHome ? 'warn' : 'info', detail: `X${b[0].toFixed(2)} Y${b[1].toFixed(2)}` });
  } else checks.push({ id: 'path-end', status: 'fail' });

  /** Index into the file of the first move outside the box, for pointing at it. */
  const outside = (w: number, h: number) => {
    const i = moves.findIndex(([x, y]) => x < -TOL || y < -TOL || x > w + TOL || y > h + TOL);
    return i < 0 ? null : { n: moves.filter(([x, y]) => x < -TOL || y < -TOL || x > w + TOL || y > h + TOL).length, line: TAP_FIRST_MOVE + i + 1 };
  };
  const off = outside(c.sheetW, c.sheetH);
  checks.push(off ? { id: 'sheet-bounds', status: 'fail', detail: String(off.n), line: off.line } : { id: 'sheet-bounds', status: moves.length ? 'pass' : 'fail' });
  if (c.maxX === null || c.maxY === null) checks.push({ id: 'machine-bounds', status: 'warn' });
  else {
    const out = outside(c.maxX, c.maxY);
    checks.push(out ? { id: 'machine-bounds', status: 'fail', detail: String(out.n), line: out.line } : { id: 'machine-bounds', status: 'pass' });
  }
  checks.push({ id: 'validation', status: c.blocking ? 'fail' : 'pass', detail: c.blocking ? String(c.blocking) : undefined });
  return { checks, ok: !checks.some(x => x.status === 'fail'), moves: moves.length, lines, extent };
}
