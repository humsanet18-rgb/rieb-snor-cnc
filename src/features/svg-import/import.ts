import type { BuildResult } from '../../engines/geometry-engine/parts';
import { LIMITS, parseSvg, SvgImportError, type ParsedSvg } from '../../engines/svg-parser/parse-svg';
import { issueSeverity, type ImportIssue, type ImportIssueCode, type ImportReport } from '../../engines/svg-parser/report';
import type { Design } from '../../types/project';
import { bboxOf } from '../../engines/geometry-engine/geometry';
import { newId } from '../nesting/model';

export type ImportOutcome = { ok: true; design: Design } | { ok: false; code: ImportIssueCode; detail?: string };

const issue = (code: ImportIssueCode, count: number): ImportIssue => ({ code, severity: issueSeverity[code], count });

/** Joins parser and contour results into one design and one complete report. */
export function finishImport(name: string, fileBytes: number, parsed: ParsedSvg, built: BuildResult): ImportOutcome {
  if (!built.parts.length) return { ok: false, code: 'empty' };
  const issues = [...parsed.issues];
  if (built.dupes) issues.push(issue('duplicates', built.dupes));
  if (built.tiny) issues.push(issue('tiny', built.tiny));
  if (built.overlaps) issues.push(issue('overlaps', built.overlaps));
  const outers = built.parts.flatMap(p => p.outers), holes = built.parts.flatMap(p => p.holes);
  const box = bboxOf(outers.flat());
  const report: ImportReport = {
    fileName: name, fileBytes, imported: parsed.imported, skipped: parsed.skipped, issues,
    stats: {
      parts: built.parts.length, contours: outers.length + holes.length, holes: holes.length,
      points: [...outers, ...holes].reduce((s, c) => s + c.length, 0),
      width: box.x1 - box.x0, height: box.y1 - box.y0, area: built.parts.reduce((s, p) => s + p.area, 0)
    }
  };
  const design: Design = {
    id: newId('design'), name: name.replace(/\.svg$/i, ''), qty: 1, rotation: 'inherit',
    parts: built.parts, markers: parsed.markers, page: parsed.page, report
  };
  return { ok: true, design };
}

const isSvgFile = (f: { name: string; type: string }) => /\.svg$/i.test(f.name) || f.type === 'image/svg+xml';

/** Validates and reads one upload; contour grouping runs through `build` so it can live in a worker. */
export async function importFile(file: File, build: (polys: ParsedSvg['shapes']) => Promise<BuildResult>): Promise<ImportOutcome> {
  if (!isSvgFile(file)) return { ok: false, code: 'not-svg' };
  if (file.size > LIMITS.fileBytes) return { ok: false, code: 'file-too-large' };
  try {
    const parsed = parseSvg((await file.text()).replace(/^﻿/, ''));
    return finishImport(file.name, file.size, parsed, await build(parsed.shapes));
  } catch (e) {
    if (e instanceof SvgImportError) return { ok: false, code: e.code, detail: e.detail };
    throw e;
  }
}
