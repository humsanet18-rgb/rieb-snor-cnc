import { toTAP } from '../engines/gcode-engine/tap';
import { buildParts, type BuildResult } from '../engines/geometry-engine/parts';
import { nest, type NestProgress, type NestResult, type NestOptions } from '../engines/nesting-engine/nest';
import { arrangeRows, type RowOptions } from '../engines/nesting-engine/rows';
import { buildCut, retraceLength } from '../engines/toolpath-engine/cut';
import { pathLength } from '../engines/toolpath-engine/stroke';
import { validateProfile, validateSheet, validateTap, type ValidationIssue } from '../engines/toolpath-engine/validate';
import type { Part, PlacedItem, Polygon, Rect, StartSpec, Stroke } from '../types/geometry';
import type { CutOptions, MachineProfile, NestMode } from '../types/project';

export interface PartsJob { kind: 'parts'; polys: Polygon[] }
export interface NestJob { kind: 'nest'; parts: Part[]; options: Omit<Partial<NestOptions>, 'anglesOf'>; anglesList?: number[][] }
export interface RowsJob { kind: 'rows'; parts: Part[]; options: RowOptions }
export interface StrokeJob {
  kind: 'strokes';
  cut: CutOptions;
  sheets: { items: PlacedItem[]; start: StartSpec }[];
  sheetW: number; sheetH: number; zones: Rect[]; gap: number; margin: number; mode: NestMode;
  profile: MachineProfile;
}
export type Job = PartsJob | NestJob | RowsJob | StrokeJob;

export interface SheetToolpath { stroke: Stroke; length: number; retrace: number; area: number; pieces: number }
export interface StrokeResult { sheets: SheetToolpath[]; issues: ValidationIssue[] }

export type JobResult<J extends Job> = J extends PartsJob ? BuildResult : J extends NestJob | RowsJob ? NestResult : StrokeResult;

/** Same work whether it runs in the worker or directly in a test. */
export function runStrokes(job: StrokeJob, onProgress?: (done: number) => unknown): StrokeResult {
  const sheets: SheetToolpath[] = [], issues: ValidationIssue[] = [];
  job.sheets.forEach((s, i) => {
    const stroke = buildCut(s.items, s.start, job.zones, job.cut);
    sheets.push({ stroke, length: pathLength(stroke.path), retrace: retraceLength(stroke.path), area: s.items.reduce((a, it) => a + it.area, 0), pieces: s.items.length });
    issues.push(...validateSheet({ sheet: i, items: s.items, stroke, start: s.start, sheetW: job.sheetW, sheetH: job.sheetH, zones: job.zones, gap: job.gap, margin: job.margin, mode: job.mode, closed: job.cut.order === 'shortest' || job.cut.returnHome }));
    const tap = toTAP(stroke.path, { name: 'check', feed: job.profile.feed, power: job.profile.power, m5: job.profile.m5, date: 'check' });
    if (Number.isFinite(job.profile.feed) && Number.isFinite(job.profile.power)) issues.push(...validateTap(i, tap, stroke.path, job.profile));
    onProgress?.(i + 1);
  });
  issues.push(...validateProfile(job.profile, sheets.map(s => s.stroke.path)));
  return { sheets, issues };
}

export async function runJob(job: Job, onProgress?: (p: NestProgress | number) => unknown): Promise<BuildResult | NestResult | StrokeResult> {
  if (job.kind === 'parts') return buildParts(job.polys);
  if (job.kind === 'nest') {
    const list = job.anglesList;
    return nest(job.parts, list ? { ...job.options, anglesOf: i => list[i] } : job.options, onProgress);
  }
  if (job.kind === 'rows') return arrangeRows(job.parts, job.options);
  return runStrokes(job, onProgress);
}
