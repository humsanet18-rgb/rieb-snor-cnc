import { bboxOf, placeTransform } from '../../engines/geometry-engine/geometry';
import type { NestResult } from '../../engines/nesting-engine/nest';
import type { BBox, Part, PlacedItem, Rect, StartSpec } from '../../types/geometry';
import type { Design, Layout, MachineProfile, PlacedPiece, Project, Settings, SheetLayout } from '../../types/project';

let idCounter = 0;
export const newId = (prefix: string): string => `${prefix}-${Date.now().toString(36)}-${(idCounter++).toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export const defaultSettings = (): Settings => ({
  sheetW: 1000, sheetH: 480, thickness: 50, gap: 5, margin: 8,
  corners: { mode: 'bottom', leftW: 150, rightW: 50, h: 50 },
  start: { enabled: true, x: 1.5, y: 1, w: 15, h: 18 },
  fill: 'rows', angles: [0, 90, 180, 270], seconds: 8, mode: 'auto', arrange: 'free',
  rows: { tolerance: 20, align: 'bottom', order: 'height', fillGaps: false, tight: true },
  cut: { order: 'shortest', returnHome: true }
});

export const defaultProfile = (): MachineProfile => ({ id: 'default', name: 'Foam F500 S300', feed: 500, power: 300, m5: false, maxX: null, maxY: null });

export const todayName = (d = new Date()): string =>
  `Foam ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function newProject(name: string): Project {
  const now = new Date().toISOString();
  return {
    id: newId('project'), name, createdAt: now, updatedAt: now, designs: [], settings: defaultSettings(),
    profileId: 'default', layouts: [], activeLayoutId: null, baseName: todayName()
  };
}

/** Neither letters nor wire may enter these corners. Y is large at the clamped side of the foam. */
export function cornerZones(s: Settings): Rect[] {
  const { mode, leftW, rightW, h } = s.corners, W = s.sheetW, H = s.sheetH, out: Rect[] = [];
  if (mode === 'none' || !h) return out;
  if (mode !== 'bottom') { if (leftW) out.push({ x: 0, y: 0, w: leftW, h }); if (rightW) out.push({ x: W - rightW, y: 0, w: rightW, h }); }
  if (mode !== 'top') { if (leftW) out.push({ x: 0, y: H - h, w: leftW, h }); if (rightW) out.push({ x: W - rightW, y: H - h, w: rightW, h }); }
  return out;
}

/** With a clamp at X0 Y0 the wire starts just past that corner instead of in it. */
export function nestingStart(s: Settings, zones: Rect[]): { box: Rect | null; start: StartSpec } {
  const atOrigin = zones.find(z => z.x === 0 && z.y === 0);
  const startX = atOrigin ? atOrigin.w + 2 : s.start.x;
  const box = s.start.enabled ? { x: startX, y: s.start.y, w: s.start.w, h: s.start.h } : null;
  return { box, start: box ? { box } : { x: atOrigin ? startX : 0, y: atOrigin ? s.start.y : 0 } };
}

export interface PieceRef { design: Design; partIndex: number; copy: number; part: Part }

export function expandPieces(designs: Design[]): PieceRef[] {
  const out: PieceRef[] = [];
  for (const design of designs) for (let copy = 0; copy < design.qty; copy++) {
    design.parts.forEach((part, partIndex) => out.push({ design, partIndex, copy, part }));
  }
  return out;
}

const pieceKey = (designId: string, partIndex: number, copy: number) => `${designId}/${partIndex}/${copy}`;

const layoutBase = (settings: Settings, zones: Rect[], number: number) => ({
  id: newId('layout'), number, createdAt: new Date().toISOString(), sheetW: settings.sheetW, sheetH: settings.sheetH,
  gap: settings.gap, margin: settings.margin, zones, fill: settings.fill,
  arrange: settings.arrange, rows: settings.arrange === 'rows' ? settings.rows : null
});

export function layoutFromNest(r: NestResult, refs: PieceRef[], settings: Settings, zones: Rect[], start: StartSpec, number: number): Layout {
  return {
    ...layoutBase(settings, zones, number), mode: settings.mode, passes: r.passes, seconds: settings.seconds,
    sheets: r.sheets.map(list => ({
      start,
      pieces: list.map(pl => {
        const { design, partIndex, copy } = refs[pl.idx];
        return { key: pieceKey(design.id, partIndex, copy), designId: design.id, partIndex, copy, deg: pl.deg, tx: pl.tx, ty: pl.ty };
      })
    })),
    unplaced: r.unplaced.map(i => ({ designId: refs[i].design.id, partIndex: refs[i].partIndex, copy: refs[i].copy }))
  };
}

/** Keep-position mode: each file is one sheet, cut exactly as drawn, like FCNC. */
export function layoutFromKeep(designs: Design[], settings: Settings, zones: Rect[], number: number): Layout {
  const sheets: SheetLayout[] = designs.filter(d => d.parts.length).map(d => {
    const b = d.markers.length ? bboxOf(d.markers[0]) : null;
    return {
      start: b ? { box: { x: b.x0, y: b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0 } } : { x: 0, y: 0 },
      pieces: d.parts.map((_, partIndex) => ({ key: pieceKey(d.id, partIndex, 0), designId: d.id, partIndex, copy: 0, deg: 0, tx: 0, ty: 0 }))
    };
  });
  return { ...layoutBase(settings, zones, number), arrange: 'free', rows: null, mode: 'keep', passes: 0, seconds: 0, sheets, unplaced: [] };
}

export function partOf(designs: Design[], p: { designId: string; partIndex: number }): Part | undefined {
  return designs.find(d => d.id === p.designId)?.parts[p.partIndex];
}

export function placeItem(part: Part, p: PlacedPiece): PlacedItem {
  const tf = placeTransform(p.deg, p.tx, p.ty);
  return { outers: part.outers.map(c => c.map(tf)), holes: part.holes.map(c => c.map(tf)), area: part.area };
}

export function sheetItems(sheet: SheetLayout, designs: Design[]): PlacedItem[] {
  const out: PlacedItem[] = [];
  for (const p of sheet.pieces) {
    const part = partOf(designs, p);
    if (part) out.push(placeItem(part, p));
  }
  return out;
}

export const itemBox = (it: PlacedItem): BBox => bboxOf(it.outers.flat());

export interface LayoutStats { sheets: number; pieces: number; usedArea: number; sheetArea: number; utilization: number; waste: number }

export function layoutStats(l: Layout, designs: Design[]): LayoutStats {
  let usedArea = 0, pieces = 0;
  for (const s of l.sheets) for (const p of s.pieces) { usedArea += partOf(designs, p)?.area ?? 0; pieces++; }
  const sheetArea = l.sheets.length * l.sheetW * l.sheetH, utilization = sheetArea ? usedArea / sheetArea : 0;
  return { sheets: l.sheets.length, pieces, usedArea, sheetArea, utilization, waste: sheetArea ? 1 - utilization : 0 };
}

/* ---------- manual position adjustment: pure edits of a layout ---------- */
export function updatePiece(l: Layout, key: string, fn: (p: PlacedPiece) => PlacedPiece): Layout {
  return { ...l, sheets: l.sheets.map(s => s.pieces.some(p => p.key === key) ? { ...s, pieces: s.pieces.map(p => p.key === key ? fn(p) : p) } : s) };
}

/** Sets the top-left corner of the piece's box on the sheet. */
export function positionPiece(part: Part, p: PlacedPiece, x: number, y: number): PlacedPiece {
  const b = itemBox(placeItem(part, p));
  return { ...p, tx: p.tx + x - b.x0, ty: p.ty + y - b.y0 };
}

/** Rotates a piece around the centre of its box, so it stays where the operator put it. */
export function rotatePiece(part: Part, p: PlacedPiece, deg: number): PlacedPiece {
  const before = itemBox(placeItem(part, p));
  const next = { ...p, deg: ((deg % 360) + 360) % 360, tx: 0, ty: 0 };
  const after = itemBox(placeItem(part, next));
  return { ...next, tx: (before.x0 + before.x1 - after.x0 - after.x1) / 2, ty: (before.y0 + before.y1 - after.y0 - after.y1) / 2 };
}

export function moveToSheet(l: Layout, key: string, target: number): Layout {
  const piece = l.sheets.flatMap(s => s.pieces).find(p => p.key === key);
  if (!piece || target < 0 || target >= l.sheets.length) return l;
  const sheets = l.sheets.map((s, i) => ({
    ...s, pieces: i === target ? [...s.pieces.filter(p => p.key !== key), piece] : s.pieces.filter(p => p.key !== key)
  }));
  return { ...l, sheets };
}
