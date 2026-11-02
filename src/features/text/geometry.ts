import type { BuildResult } from '../../engines/geometry-engine/parts';
import { bboxOf } from '../../engines/geometry-engine/geometry';
import { issueSeverity, type ImportIssue, type ImportIssueCode, type ImportReport } from '../../engines/svg-parser/report';
import type { Polygon } from '../../types/geometry';
import type { Design } from '../../types/project';
import { newId } from '../nesting/model';

/** Pieces narrower than this in either direction are likely to break or drop out while cutting. */
export const SMALL_PIECE_MM = 5;

/** Scales outlines by `factor` and moves their top-left corner to 0, 0. */
export function scaleOutlines(rings: Polygon[], factor: number): Polygon[] {
  if (!rings.length) return [];
  const b = bboxOf(rings.flat());
  return rings.map(r => r.map(([x, y]) => [+((x - b.x0) * factor).toFixed(3), +((y - b.y0) * factor).toFixed(3)]));
}

export type TextCheckCode = 'empty' | 'small' | 'too-wide' | 'too-tall' | 'overlaps';
export interface TextCheck { code: TextCheckCode; severity: 'error' | 'warning' | 'info'; count: number; detail?: string }

export interface TextSummary {
  pieces: number; contours: number; holes: number; points: number;
  width: number; height: number; smallest: number;
  checks: TextCheck[];
}

/** What the operator needs to know before the curves go to nesting. */
export function summarise(built: BuildResult, sheet: { w: number; h: number; margin: number }): TextSummary {
  const parts = built.parts, outers = parts.flatMap(p => p.outers), holes = parts.flatMap(p => p.holes);
  const box = outers.length ? bboxOf(outers.flat()) : { x0: 0, y0: 0, x1: 0, y1: 0 };
  const sizes = parts.map(p => Math.min(p.bbox.x1 - p.bbox.x0, p.bbox.y1 - p.bbox.y0));
  const checks: TextCheck[] = [];
  if (!parts.length) checks.push({ code: 'empty', severity: 'error', count: 1 });
  const small = sizes.filter(s => s < SMALL_PIECE_MM).length;
  if (small) checks.push({ code: 'small', severity: 'warning', count: small, detail: String(SMALL_PIECE_MM) });
  const usableW = sheet.w - sheet.margin * 2, usableH = sheet.h - sheet.margin * 2;
  const wide = parts.filter(p => p.bbox.x1 - p.bbox.x0 > usableW).length, tall = parts.filter(p => p.bbox.y1 - p.bbox.y0 > usableH).length;
  if (wide) checks.push({ code: 'too-wide', severity: 'warning', count: wide, detail: usableW.toFixed(0) });
  if (tall) checks.push({ code: 'too-tall', severity: 'warning', count: tall, detail: usableH.toFixed(0) });
  if (built.overlaps) checks.push({ code: 'overlaps', severity: 'warning', count: built.overlaps });
  return {
    pieces: parts.length, contours: outers.length + holes.length, holes: holes.length,
    points: [...outers, ...holes].reduce((s, c) => s + c.length, 0),
    width: box.x1 - box.x0, height: box.y1 - box.y0, smallest: sizes.length ? Math.min(...sizes) : 0, checks
  };
}

const issue = (code: ImportIssueCode, count: number): ImportIssue => ({ code, severity: issueSeverity[code], count });

/** A design in the same shape as an SVG import, so nesting, saving and backups treat it the same way. */
export function textDesign(text: string, fontLabel: string, built: BuildResult, outlineCount: number): Design {
  const outers = built.parts.flatMap(p => p.outers), holes = built.parts.flatMap(p => p.holes);
  const box = bboxOf(outers.flat());
  const name = text.replace(/\s+/g, ' ').trim().slice(0, 60);
  const issues: ImportIssue[] = [];
  if (built.dupes) issues.push(issue('duplicates', built.dupes));
  if (built.tiny) issues.push(issue('tiny', built.tiny));
  if (built.overlaps) issues.push(issue('overlaps', built.overlaps));
  const report: ImportReport = {
    fileName: `${name} (${fontLabel})`, fileBytes: new TextEncoder().encode(text).length,
    imported: { path: outlineCount }, skipped: {}, issues,
    stats: {
      parts: built.parts.length, contours: outers.length + holes.length, holes: holes.length,
      points: [...outers, ...holes].reduce((s, c) => s + c.length, 0),
      width: box.x1 - box.x0, height: box.y1 - box.y0, area: built.parts.reduce((s, p) => s + p.area, 0)
    }
  };
  return {
    id: newId('design'), name, qty: 1, rotation: 'inherit', parts: built.parts, markers: [],
    page: { w: Math.max(1, box.x1), h: Math.max(1, box.y1) }, report
  };
}
