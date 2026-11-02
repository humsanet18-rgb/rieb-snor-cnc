import type { ImportIssue, ImportReport } from '../engines/svg-parser/report';
import { issueSeverity } from '../engines/svg-parser/report';
import { defaultSettings } from '../features/nesting/model';
import type { Matrix, Part, Point, Polygon, Rect, StartSpec } from '../types/geometry';
import type { ShapeKind, Subpath, VectorDocument, VItem, VLayer } from '../engines/vector-engine/types';
import type { Arrange, CornerMode, CutOptions, CutOrder, Design, Layout, MachineProfile, NestMode, PlacedPiece, Project, RowSettings, Settings, SheetLayout, UnplacedPiece } from '../types/project';

export const FILE_FORMAT = 'rieb-snor-project';
export const FILE_VERSION = 1;
export const MAX_PROJECT_BYTES = 200 * 1024 * 1024;
const MAX_DESIGNS = 500, MAX_POINTS = 5_000_000, MAX_NAME = 200;

export interface ProjectFile { format: string; version: number; savedAt: string; project: Project; profile: MachineProfile }

export function toProjectFile(project: Project, profile: MachineProfile): string {
  const file: ProjectFile = { format: FILE_FORMAT, version: FILE_VERSION, savedAt: new Date().toISOString(), project, profile };
  return JSON.stringify(file);
}

/** Thrown for a file that cannot be trusted; `field` says where reading stopped. */
export class ProjectFileError extends Error {
  constructor(public field: string) { super(`Invalid project file: ${field}`); }
}

type Obj = Record<string, unknown>;
const bad = (field: string): never => { throw new ProjectFileError(field); };
const obj = (v: unknown, f: string): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? v as Obj : bad(f));
const arr = (v: unknown, f: string): unknown[] => (Array.isArray(v) ? v : bad(f));
const num = (v: unknown, f: string): number => (typeof v === 'number' && Number.isFinite(v) ? v : bad(f));
const pos = (v: unknown, f: string): number => { const n = num(v, f); return n >= 0 ? n : bad(f); };
const str = (v: unknown, f: string): string => (typeof v === 'string' && v.length <= MAX_NAME * 4 ? v.slice(0, MAX_NAME * 4) : bad(f));
const bool = (v: unknown, f: string): boolean => (typeof v === 'boolean' ? v : bad(f));
const oneOf = <T extends string>(v: unknown, list: readonly T[], f: string): T => (list.includes(v as T) ? v as T : bad(f));
const rect = (v: unknown, f: string): Rect => { const o = obj(v, f); return { x: num(o.x, f), y: num(o.y, f), w: pos(o.w, f), h: pos(o.h, f) }; };
const date = (v: unknown, f: string): string => { const s = str(v, f); return Number.isNaN(Date.parse(s)) ? bad(f) : s; };

/** Rebuilds everything field by field, so only known, checked values reach the app. */
class Reader {
  points = 0;
  polygon(v: unknown, f: string): Polygon {
    const list = arr(v, f);
    this.points += list.length;
    if (this.points > MAX_POINTS) bad('too many points');
    return list.map((q): Point => { const p = arr(q, f); return [num(p[0], f), num(p[1], f)]; });
  }
  polygons(v: unknown, f: string): Polygon[] { return arr(v, f).map(p => this.polygon(p, f)); }
  part(v: unknown): Part {
    const o = obj(v, 'part'), b = obj(o.bbox, 'part.bbox');
    return {
      outers: this.polygons(o.outers, 'part.outers'), holes: this.polygons(o.holes, 'part.holes'), area: pos(o.area, 'part.area'),
      bbox: { x0: num(b.x0, 'bbox'), y0: num(b.y0, 'bbox'), x1: num(b.x1, 'bbox'), y1: num(b.y1, 'bbox') }
    };
  }
  design(v: unknown): Design {
    const o = obj(v, 'design'), page = obj(o.page, 'design.page');
    return {
      id: str(o.id, 'design.id'), name: str(o.name, 'design.name'), qty: Math.max(1, Math.min(999, Math.floor(pos(o.qty, 'design.qty')))),
      rotation: oneOf(o.rotation, ['inherit', 'fixed'], 'design.rotation'),
      parts: arr(o.parts, 'design.parts').map(p => this.part(p)), markers: this.polygons(o.markers, 'design.markers'),
      page: { w: pos(page.w, 'page'), h: pos(page.h, 'page') }, report: report(o.report),
      ...(o.sourceKey === undefined ? {} : { sourceKey: str(o.sourceKey, 'design.sourceKey') })
    };
  }
}

function counts(v: unknown, f: string): Record<string, number> {
  const out: Record<string, number> = Object.create(null);
  for (const [k, n] of Object.entries(obj(v, f))) if (/^[\w:.-]{1,40}$/.test(k)) out[k] = pos(n, f);
  return { ...out };
}

function report(v: unknown): ImportReport {
  const o = obj(v, 'report'), s = obj(o.stats, 'report.stats');
  const issues: ImportIssue[] = arr(o.issues, 'report.issues').map(i => {
    const q = obj(i, 'issue'), code = oneOf(q.code, Object.keys(issueSeverity) as (keyof typeof issueSeverity)[], 'issue.code');
    return { code, severity: issueSeverity[code], count: pos(q.count, 'issue.count'), detail: q.detail === undefined ? undefined : str(q.detail, 'issue.detail') };
  });
  return {
    fileName: str(o.fileName, 'report.fileName'), fileBytes: pos(o.fileBytes, 'report.fileBytes'),
    imported: counts(o.imported, 'report.imported'), skipped: counts(o.skipped, 'report.skipped'), issues,
    stats: {
      parts: pos(s.parts, 'stats'), contours: pos(s.contours, 'stats'), holes: pos(s.holes, 'stats'), points: pos(s.points, 'stats'),
      width: pos(s.width, 'stats'), height: pos(s.height, 'stats'), area: pos(s.area, 'stats')
    }
  };
}

function rowSettings(v: unknown): RowSettings {
  const o = obj(v, 'rows');
  return {
    tolerance: pos(o.tolerance, 'rows.tolerance'), align: oneOf(o.align, ['bottom', 'top', 'center'], 'rows.align'),
    order: oneOf(o.order, ['height', 'file'], 'rows.order'), fillGaps: bool(o.fillGaps, 'rows.fillGaps'), tight: bool(o.tight, 'rows.tight')
  };
}

function cutOptions(v: unknown): CutOptions {
  const o = obj(v, 'cut');
  return { order: oneOf<CutOrder>(o.order, ['shortest', 'rows', 'columns', 'snake'], 'cut.order'), returnHome: bool(o.returnHome, 'cut.returnHome') };
}

export function readSettings(v: unknown): Settings {
  const o = obj(v, 'settings'), c = obj(o.corners, 'corners'), s = obj(o.start, 'start'), d = defaultSettings();
  const sheetW = pos(o.sheetW, 'sheetW'), sheetH = pos(o.sheetH, 'sheetH');
  if (sheetW < 10 || sheetH < 10 || sheetW > 100000 || sheetH > 100000) bad('sheet size');
  const angles = arr(o.angles, 'angles').map(a => num(a, 'angles'));
  if (!angles.length || angles.length > 36) bad('angles');
  return {
    sheetW, sheetH, thickness: pos(o.thickness, 'thickness'), gap: pos(o.gap, 'gap'), margin: pos(o.margin, 'margin'),
    corners: {
      mode: oneOf<CornerMode>(c.mode, ['bottom', 'top', 'all', 'none'], 'corners.mode'),
      leftW: pos(c.leftW, 'corners'), rightW: pos(c.rightW, 'corners'), h: pos(c.h, 'corners')
    },
    start: { enabled: bool(s.enabled, 'start'), x: pos(s.x, 'start'), y: pos(s.y, 'start'), w: pos(s.w, 'start'), h: pos(s.h, 'start') },
    fill: oneOf(o.fill, ['rows', 'columns'], 'fill'), angles, seconds: pos(o.seconds, 'seconds'),
    mode: oneOf<NestMode>(o.mode, ['auto', 'keep', 'manual'], 'mode'),
    arrange: o.arrange === undefined ? d.arrange : oneOf<Arrange>(o.arrange, ['free', 'rows'], 'arrange'),
    rows: o.rows === undefined ? d.rows : rowSettings(o.rows),
    cut: o.cut === undefined ? d.cut : cutOptions(o.cut)
  };
}

const startSpec = (v: unknown): StartSpec => {
  const o = obj(v, 'sheet.start');
  return o.box !== undefined ? { box: rect(o.box, 'sheet.start') } : { x: num(o.x, 'sheet.start'), y: num(o.y, 'sheet.start') };
};

function layout(v: unknown, designs: Set<string>): Layout {
  const o = obj(v, 'layout');
  const ref = (id: unknown) => { const s = str(id, 'piece.designId'); return designs.has(s) ? s : bad('piece.designId'); };
  const sheets: SheetLayout[] = arr(o.sheets, 'layout.sheets').map(sv => {
    const s = obj(sv, 'sheet');
    return {
      start: startSpec(s.start),
      pieces: arr(s.pieces, 'sheet.pieces').map((pv): PlacedPiece => {
        const p = obj(pv, 'piece');
        return { key: str(p.key, 'piece.key'), designId: ref(p.designId), partIndex: pos(p.partIndex, 'piece'), copy: pos(p.copy, 'piece'), deg: num(p.deg, 'piece'), tx: num(p.tx, 'piece'), ty: num(p.ty, 'piece') };
      })
    };
  });
  const unplaced: UnplacedPiece[] = arr(o.unplaced, 'layout.unplaced').map(uv => {
    const u = obj(uv, 'unplaced');
    return { designId: ref(u.designId), partIndex: pos(u.partIndex, 'unplaced'), copy: pos(u.copy, 'unplaced') };
  });
  return {
    id: str(o.id, 'layout.id'), number: pos(o.number, 'layout.number'), createdAt: date(o.createdAt, 'layout.createdAt'),
    mode: oneOf<NestMode>(o.mode, ['auto', 'keep', 'manual'], 'layout.mode'),
    sheetW: pos(o.sheetW, 'layout'), sheetH: pos(o.sheetH, 'layout'), gap: pos(o.gap, 'layout'), margin: pos(o.margin, 'layout'),
    zones: arr(o.zones, 'layout.zones').map(z => rect(z, 'zone')), fill: oneOf(o.fill, ['rows', 'columns'], 'layout.fill'),
    arrange: o.arrange === undefined ? 'free' : oneOf<Arrange>(o.arrange, ['free', 'rows'], 'layout.arrange'),
    rows: o.rows === undefined || o.rows === null ? null : rowSettings(o.rows),
    sheets, unplaced, passes: pos(o.passes, 'layout'), seconds: pos(o.seconds, 'layout')
  };
}

export function readProfile(v: unknown): MachineProfile {
  const o = obj(v, 'profile');
  const limit = (x: unknown) => (x === null || x === undefined ? null : pos(x, 'profile.travel'));
  return {
    id: str(o.id, 'profile.id'), name: str(o.name, 'profile.name'), feed: num(o.feed, 'profile.feed'), power: num(o.power, 'profile.power'),
    m5: bool(o.m5, 'profile.m5'), maxX: limit(o.maxX), maxY: limit(o.maxY),
    ...(typeof o.verifiedAt === 'string' && !Number.isNaN(Date.parse(o.verifiedAt)) ? { verifiedAt: o.verifiedAt } : {})
  };
}

export function readProject(v: unknown): Project {
  const o = obj(v, 'project'), r = new Reader();
  const list = arr(o.designs, 'designs');
  if (list.length > MAX_DESIGNS) bad('too many designs');
  const designs = list.map(d => r.design(d));
  const ids = new Set(designs.map(d => d.id));
  if (ids.size !== designs.length) bad('duplicate design id');
  const layouts = arr(o.layouts, 'layouts').map(l => layout(l, ids));
  const active = o.activeLayoutId === null ? null : str(o.activeLayoutId, 'activeLayoutId');
  return {
    id: str(o.id, 'project.id'), name: str(o.name, 'project.name'), createdAt: date(o.createdAt, 'project.createdAt'), updatedAt: date(o.updatedAt, 'project.updatedAt'),
    designs, settings: readSettings(o.settings), profileId: str(o.profileId, 'project.profileId'), layouts,
    activeLayoutId: layouts.some(l => l.id === active) ? active : null, baseName: str(o.baseName, 'project.baseName'),
    ...(o.document === undefined ? {} : { document: readDocument(o.document, r) })
  };
}

const MAX_DEPTH = 20, MAX_ITEMS = 50_000;
const point = (v: unknown, f: string): Point => { const p = arr(v, f); return [num(p[0], f), num(p[1], f)]; };
const color = (v: unknown, f: string): string | null => (v === null ? null : /^#[0-9a-f]{3,8}$/i.test(str(v, f)) ? v as string : bad(f));
const KINDS: ShapeKind[] = ['path', 'rect', 'ellipse', 'polygon', 'star', 'spiral', 'grid', 'line', 'polyline', 'freehand', 'curves'];

/** The design page, checked node by node with the same limits as the rest of the file. */
export function readDocument(v: unknown, r = new Reader()): VectorDocument {
  const o = obj(v, 'document'), page = obj(o.page, 'document.page');
  let count = 0;
  const item = (x: unknown, depth: number): VItem => {
    if (++count > MAX_ITEMS || depth > MAX_DEPTH) bad('document too large');
    const q = obj(x, 'item');
    const base = { id: str(q.id, 'item.id'), name: str(q.name, 'item.name'), locked: bool(q.locked, 'item.locked'), hidden: bool(q.hidden, 'item.hidden') };
    if (q.type === 'group') return { ...base, type: 'group', children: arr(q.children, 'item.children').map(c => item(c, depth + 1)) };
    if (q.type !== 'path') bad('item.type');
    const m = arr(q.matrix, 'item.matrix').map(n => num(n, 'item.matrix'));
    if (m.length !== 6) bad('item.matrix');
    const s = obj(q.style, 'item.style');
    const subpaths: Subpath[] = arr(q.subpaths, 'item.subpaths').map(sp => {
      const so = obj(sp, 'subpath'), nodes = arr(so.nodes, 'subpath.nodes');
      r.points += nodes.length * 3;
      if (r.points > MAX_POINTS) bad('too many points');
      return {
        closed: bool(so.closed, 'subpath.closed'),
        nodes: nodes.map(n => { const no = obj(n, 'node'); return { p: point(no.p, 'node.p'), ...(no.i === undefined ? {} : { i: point(no.i, 'node.i') }), ...(no.o === undefined ? {} : { o: point(no.o, 'node.o') }) }; })
      };
    });
    return {
      ...base, type: 'path', kind: oneOf(q.kind, KINDS, 'item.kind'), subpaths, matrix: m as Matrix,
      style: { fill: color(s.fill, 'style.fill'), stroke: color(s.stroke, 'style.stroke'), strokeWidth: pos(s.strokeWidth, 'style.strokeWidth') }
    };
  };
  const layers: VLayer[] = arr(o.layers, 'document.layers').map(l => {
    const lo = obj(l, 'layer');
    return { id: str(lo.id, 'layer.id'), name: str(lo.name, 'layer.name'), visible: bool(lo.visible, 'layer.visible'), locked: bool(lo.locked, 'layer.locked'), items: arr(lo.items, 'layer.items').map(x => item(x, 0)) };
  });
  if (!layers.length) bad('document.layers');
  const active = str(o.activeLayerId, 'document.activeLayerId');
  return { version: 1, page: { w: pos(page.w, 'document.page'), h: pos(page.h, 'document.page') }, layers, activeLayerId: layers.some(l => l.id === active) ? active : layers[0].id };
}

/** Parses an untrusted backup file. Nothing from it runs; every value is type-checked and bounded. */
export function parseProjectFile(text: string): { project: Project; profile: MachineProfile } {
  if (text.length > MAX_PROJECT_BYTES) bad('file too large');
  let data: unknown;
  try { data = JSON.parse(text); } catch { bad('not JSON'); }
  const o = obj(data, 'file');
  if (o.format !== FILE_FORMAT) bad('format');
  if (typeof o.version !== 'number' || o.version > FILE_VERSION || o.version < 1) bad('version');
  return { project: readProject(o.project), profile: readProfile(o.profile) };
}
