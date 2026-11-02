import { tr } from '../../app/i18n';
import { buildParts } from '../../engines/geometry-engine/parts';
import { parseSvg, SvgImportError } from '../../engines/svg-parser/parse-svg';
import {
  addItems, addLayer, alignItems, breakApart, cloneForPaste, combineItems, distributeItems, documentToSVG, duplicateItems, editable,
  emptyDocument, findTop, groupItems, itemBBox, moveToLayer, patchLayer, polygonsToItem, removeItems, removeLayer, reorder, reverseItems,
  rotateAbout, scaleAbout, selectionBBox, skewAbout, styleItems, toPolygons, transformItems, translate, ungroupItems, updateItems,
  type AlignMode, type Order
} from '../../engines/vector-engine/document';
import type { VectorDocument, VItem, VLayer, VStyle } from '../../engines/vector-engine/types';
import { cleanBaseName, saveFile } from '../../services/download';
import { commit, projectStore } from '../../stores/project-store';
import { toast } from '../../stores/ui-store';
import type { Matrix } from '../../types/geometry';
import type { Project } from '../../types/project';
import { finishImport } from '../svg-import/import';
import { designStore, ZOOM } from './design-store';

/** The project's design page; a project from before it existed gets an empty page the size of its foam sheet. */
export function docOf(p: Project): VectorDocument {
  if (p.document) return p.document;
  // One empty page per project version, so components reading it see the same object each time.
  let doc = emptyDocs.get(p);
  if (!doc) emptyDocs.set(p, doc = emptyDocument({ w: p.settings.sheetW, h: p.settings.sheetH }, tr('design.layer.default', { n: 1 })));
  return doc;
}
const emptyDocs = new WeakMap<Project, VectorDocument>();

export const currentDoc = (): VectorDocument => docOf(projectStore.get().project);

/** One undoable change to the page. */
export function editDoc(fn: (doc: VectorDocument) => VectorDocument): void {
  commit(p => {
    const doc = docOf(p), next = fn(doc);
    return next === doc && p.document ? p : { ...p, document: next };
  });
}

/** Chosen objects that still exist and may be changed. */
export function selection(): string[] {
  const doc = currentDoc();
  return editable(doc, designStore.get().selected);
}

const select = (ids: string[]) => designStore.patch({ selected: ids });
export const hasSelection = (min = 1): boolean => selection().length >= min;

export function addItem(item: VItem): void {
  editDoc(d => addItems(d, [item]));
  select([item.id]);
}

export function deleteSelection(): void {
  const ids = selection();
  if (!ids.length) return;
  editDoc(d => removeItems(d, ids));
  select([]);
}

export function duplicateSelection(): void {
  const ids = selection(), step = designStore.get().nudge;
  if (!ids.length) return;
  let out: string[] = [];
  editDoc(d => { const r = duplicateItems(d, ids, step, step); out = r.ids; return r.doc; });
  select(out);
}

export function copySelection(): void {
  const doc = currentDoc(), items = selection().map(id => findTop(doc, id)?.item).filter((i): i is VItem => !!i);
  if (items.length) designStore.patch({ clipboard: items, pasteCount: 0 });
}

export function cutSelection(): void {
  copySelection();
  deleteSelection();
}

export function paste(): void {
  const s = designStore.get();
  if (!s.clipboard.length) return;
  const n = s.pasteCount + 1, items = cloneForPaste(s.clipboard, s.nudge * n, s.nudge * n);
  editDoc(d => addItems(d, items));
  designStore.patch({ pasteCount: n });
  select(items.map(i => i.id));
}

export function selectAll(): void {
  const doc = currentDoc();
  select(editable(doc, doc.layers.flatMap(l => l.items.map(i => i.id))));
}

export function transformSelection(m: Matrix): void {
  const ids = selection();
  if (ids.length) editDoc(d => transformItems(d, ids, m));
}

export function nudge(dx: number, dy: number): void {
  transformSelection(translate(dx, dy));
}

function center(): [number, number] | null {
  const b = selectionBBox(currentDoc(), selection());
  return b ? [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2] : null;
}

export function rotateSelection(deg: number): void {
  const c = center();
  if (c) transformSelection(rotateAbout(deg, c[0], c[1]));
}

export function flipSelection(axis: 'h' | 'v'): void {
  const c = center();
  if (c) transformSelection(axis === 'h' ? scaleAbout(-1, 1, c[0], c[1]) : scaleAbout(1, -1, c[0], c[1]));
}

export function skewSelection(ax: number, ay: number): void {
  const c = center();
  if (c) transformSelection(skewAbout(ax, ay, c[0], c[1]));
}

/** Sets the selection's bounding box; width and height scale about the top-left corner. */
export function setSelectionBox(part: Partial<{ x: number; y: number; w: number; h: number }>, keepRatio: boolean): void {
  const b = selectionBBox(currentDoc(), selection());
  if (!b) return;
  const w0 = b.x1 - b.x0, h0 = b.y1 - b.y0;
  let sx = part.w !== undefined && w0 > 1e-9 ? part.w / w0 : 1, sy = part.h !== undefined && h0 > 1e-9 ? part.h / h0 : 1;
  if (keepRatio) { if (part.w !== undefined) sy = sx; else if (part.h !== undefined) sx = sy; }
  if (!(sx > 0) || !(sy > 0)) return;
  const x = part.x ?? b.x0, y = part.y ?? b.y0;
  transformSelection([sx, 0, 0, sy, x - b.x0 * sx, y - b.y0 * sy]);
}

export function groupSelection(): void {
  const ids = selection();
  let id: string | null = null;
  editDoc(d => { const r = groupItems(d, ids, tr('design.group.name')); id = r.id; return r.doc; });
  if (id) select([id]);
}

export function ungroupSelection(): void {
  const ids = selection();
  let out: string[] = [];
  editDoc(d => { const r = ungroupItems(d, ids); out = r.ids; return r.doc; });
  if (out.length) select(out);
}

export function combineSelection(): void {
  const ids = selection();
  let id: string | null = null;
  editDoc(d => { const r = combineItems(d, ids, tr('design.combined.name')); id = r.id; return r.doc; });
  if (id) select([id]);
}

export function breakApartSelection(): void {
  const ids = selection();
  let out: string[] = [];
  editDoc(d => { const r = breakApart(d, ids); out = r.ids; return r.doc; });
  if (out.length) select(out);
}

export const reverseSelection = () => { const ids = selection(); if (ids.length) editDoc(d => reverseItems(d, ids)); };
export const alignSelection = (mode: AlignMode, toPage = false) => { const ids = selection(); if (ids.length) editDoc(d => alignItems(d, ids, mode, toPage)); };
export const distributeSelection = (axis: 'x' | 'y') => { const ids = selection(); if (ids.length >= 3) editDoc(d => distributeItems(d, ids, axis)); };
export const orderSelection = (how: Order) => { const ids = selection(); if (ids.length) editDoc(d => reorder(d, ids, how)); };
export const styleSelection = (style: Partial<VStyle>) => { const ids = selection(); if (ids.length) editDoc(d => styleItems(d, ids, style)); };

export function lockSelection(): void {
  const ids = selection();
  if (!ids.length) return;
  editDoc(d => updateItems(d, ids, i => ({ ...i, locked: true })));
  select([]);
}

export function hideSelection(): void {
  const ids = selection();
  if (!ids.length) return;
  editDoc(d => updateItems(d, ids, i => ({ ...i, hidden: true })));
  select([]);
}

const anyTop = (doc: VectorDocument, test: (i: VItem) => boolean) => doc.layers.some(l => l.items.some(test));
export const hasLocked = () => anyTop(currentDoc(), i => i.locked);
export const hasHidden = () => anyTop(currentDoc(), i => i.hidden);

export function unlockAll(): void {
  editDoc(d => ({ ...d, layers: d.layers.map(l => (l.items.some(i => i.locked) ? { ...l, items: l.items.map(i => (i.locked ? { ...i, locked: false } : i)) } : l)) }));
}

export function showAll(): void {
  editDoc(d => ({ ...d, layers: d.layers.map(l => (l.items.some(i => i.hidden) ? { ...l, items: l.items.map(i => (i.hidden ? { ...i, hidden: false } : i)) } : l)) }));
}

export function renameItem(id: string, name: string): void {
  editDoc(d => updateItems(d, [id], i => ({ ...i, name })));
}

/* ---------- layers and page ---------- */

export const newLayer = () => editDoc(d => addLayer(d, tr('design.layer.default', { n: d.layers.length + 1 })));
export const setLayer = (id: string, part: Partial<Pick<VLayer, 'name' | 'visible' | 'locked'>>) => editDoc(d => patchLayer(d, id, part));
export const deleteLayer = (id: string) => editDoc(d => removeLayer(d, id));
export const activateLayer = (id: string) => editDoc(d => (d.activeLayerId === id ? d : { ...d, activeLayerId: id }));
export const selectionToLayer = (id: string) => { const ids = selection(); if (ids.length) editDoc(d => moveToLayer(d, ids, id)); };

export function setPage(w: number, h: number): void {
  if (!(w > 0) || !(h > 0)) return;
  editDoc(d => ({ ...d, page: { w, h } }));
}

/** Makes the page the size of the foam sheet set for nesting. */
export function pageFromSheet(): void {
  const s = projectStore.get().project.settings;
  setPage(s.sheetW, s.sheetH);
  designStore.patch({ fit: 'page' });
}

/* ---------- view ---------- */

export function zoomBy(factor: number, at?: { x: number; y: number }, view?: { w: number; h: number }): void {
  const s = designStore.get(), z = Math.min(ZOOM.max, Math.max(ZOOM.min, s.zoom * factor));
  const px = at ?? (view ? { x: view.w / 2, y: view.h / 2 } : { x: 0, y: 0 });
  // Keep the page point under the cursor where it is.
  const mx = s.pan.x + px.x / s.zoom, my = s.pan.y + px.y / s.zoom;
  designStore.patch({ zoom: z, pan: { x: mx - px.x / z, y: my - px.y / z } });
}

export const fitPage = () => designStore.patch({ fit: 'page' });
export const fitSelection = () => designStore.patch({ fit: hasSelection() ? 'selection' : 'page' });

/* ---------- files and production ---------- */

export function exportSvg(): void {
  const { project } = projectStore.get(), doc = docOf(project), ids = selection();
  const only = ids.length ? ids.map(id => findTop(doc, id)?.item).filter((i): i is VItem => !!i) : undefined;
  const name = `${cleanBaseName(project.name)}-design.svg`;
  saveFile(name, documentToSVG(doc, only), 'image/svg+xml');
  toast(tr('toast.saved', { name }));
}

/** Reads SVG files onto the page as editable objects, one object per file. */
export async function importSvgFiles(files: File[]): Promise<void> {
  for (const file of files) {
    try {
      const parsed = parseSvg(await file.text());
      if (!parsed.shapes.length) { toast(tr('design.import.empty', { name: file.name }), true); continue; }
      const item = polygonsToItem(parsed.shapes, file.name.replace(/\.svg$/i, ''));
      addItem(item);
      toast(tr('design.import.done', { name: file.name }));
    } catch (e) {
      toast(tr('design.import.failed', { name: file.name, why: e instanceof SvgImportError ? e.code : String(e) }), true);
    }
  }
  designStore.patch({ fit: 'selection' });
}

/**
 * Turns the chosen objects (or the whole page) into a design for nesting.
 * Sending the same objects again replaces the design instead of adding a copy.
 */
export function sendToProduction(): boolean {
  const { project } = projectStore.get(), doc = docOf(project);
  const ids = selection().length ? selection() : doc.layers.filter(l => l.visible).flatMap(l => l.items.filter(i => !i.hidden).map(i => i.id));
  const items = ids.map(id => findTop(doc, id)?.item).filter((i): i is VItem => !!i);
  const { closed, open } = toPolygons(items);
  if (!closed.length) { toast(tr('design.send.none'), true); return false; }
  const built = buildParts(closed);
  const name = items.length === 1 ? items[0].name : tr('design.send.name', { name: project.name });
  const out = finishImport(name, 0, { page: doc.page, shapes: closed, markers: [], imported: { path: closed.length }, skipped: open ? { open } : {}, issues: [] }, built);
  if (!out.ok) { toast(tr('design.send.none'), true); return false; }
  const key = 'design:' + [...ids].sort().join(',');
  const existing = project.designs.find(d => d.sourceKey === key);
  const design = { ...out.design, sourceKey: key, ...(existing ? { id: existing.id, qty: existing.qty, rotation: existing.rotation } : {}) };
  commit(p => ({ ...p, designs: existing ? p.designs.map(d => (d.id === existing.id ? design : d)) : [...p.designs, design] }));
  toast(tr(existing ? 'design.send.updated' : 'design.send.added', { name: design.name, n: built.parts.length }) + (open ? ' ' + tr('design.send.open', { n: open }) : ''));
  return true;
}

export const selectionBox = () => selectionBBox(currentDoc(), selection());
export { itemBBox };
