import { makeZip } from '../engines/export/zip';
import { toSVG } from '../engines/export/svg-export';
import { toTAP } from '../engines/gcode-engine/tap';
import { hasBlocking } from '../engines/toolpath-engine/validate';
import { cornerZones, expandPieces, layoutFromKeep, layoutFromNest, nestingStart, newProject, sheetItems } from '../features/nesting/model';
import { importFile } from '../features/svg-import/import';
import { cleanBaseName, saveFile, sheetFileName, tapDate } from '../services/download';
import { JobCancelled, startJob, type RunningJob } from '../services/engine-client';
import { toProjectFile } from '../services/project-io';
import { activeLayout, activeProfile, commit, flushSave, loadInto, projectStore } from '../stores/project-store';
import { go, toast, uiStore } from '../stores/ui-store';
import type { Layout } from '../types/project';
import { tr } from './i18n';

const MAX_LAYOUTS = 8;
let running: RunningJob<unknown> | null = null;

export function cancelJob(): void {
  running?.cancel();
  running = null;
}

export async function addFiles(list: File[]): Promise<void> {
  if (uiStore.get().job || !list.length) return;
  uiStore.patch({ job: { kind: 'import', progress: 0, sheets: 0, pass: 0, done: 0, total: list.length }, failures: [] });
  const failures = [];
  let added = 0;
  try {
    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      uiStore.patch({ job: { kind: 'import', progress: i / list.length, sheets: 0, pass: 0, done: i, total: list.length, name: file.name } });
      await new Promise(r => setTimeout(r)); // let the name paint before a big file blocks parsing
      const outcome = await importFile(file, polys => {
        const job = startJob({ kind: 'parts', polys });
        running = job;
        return job.promise;
      });
      if (outcome.ok) { commit(p => ({ ...p, designs: [...p.designs, outcome.design] })); added++; }
      else failures.push({ name: file.name, code: outcome.code, detail: outcome.detail });
    }
  } catch (e) {
    if (!(e instanceof JobCancelled)) toast(tr('toast.failed', { why: e instanceof Error ? e.message : String(e) }), true);
  }
  running = null;
  uiStore.patch({ job: null, failures });
  if (added) { if (uiStore.get().section !== 'import') go('import'); toast(tr('toast.imported', { n: added })); }
}

export async function addSample(file: string): Promise<void> {
  try {
    const res = await fetch(`samples/${file}`);
    if (!res.ok) throw new Error(String(res.status));
    await addFiles([new File([await res.text()], file, { type: 'image/svg+xml' })]);
  } catch (e) {
    toast(tr('toast.failed', { why: e instanceof Error ? e.message : String(e) }), true);
  }
}

export function removeDesign(id: string): void {
  commit(p => {
    const layouts = p.layouts.filter(l => !l.sheets.some(s => s.pieces.some(x => x.designId === id)) && !l.unplaced.some(u => u.designId === id));
    return { ...p, designs: p.designs.filter(d => d.id !== id), layouts, activeLayoutId: layouts.some(l => l.id === p.activeLayoutId) ? p.activeLayoutId : layouts[layouts.length - 1]?.id ?? null };
  });
}

function addLayout(layout: Layout) {
  commit(p => {
    const layouts = [...p.layouts, layout].slice(-MAX_LAYOUTS);
    return { ...p, layouts, activeLayoutId: layout.id };
  });
  uiStore.patch({ sheet: 0, selected: [], highlightRow: null });
}

/** Runs the chosen mode. Manual mode starts from automatic nesting, then the operator moves pieces. */
export async function generate(): Promise<void> {
  const { project } = projectStore.get();
  if (uiStore.get().job) return;
  const designs = project.designs.filter(d => d.parts.length), settings = project.settings;
  if (!designs.length) { toast(tr('toast.noDesigns'), true); return; }
  const zones = cornerZones(settings), number = project.layouts.reduce((n, l) => Math.max(n, l.number), 0) + 1;
  if (settings.mode === 'keep') { addLayout(layoutFromKeep(designs, settings, zones, number)); return; }

  const refs = expandPieces(designs), { box, start } = nestingStart(settings, zones);
  uiStore.patch({ job: { kind: 'nest', progress: 0, sheets: 0, pass: 0, stage: 'search' } });
  const job = settings.arrange === 'rows' ? startJob({
    kind: 'rows', parts: refs.map(r => r.part),
    options: { ...settings.rows, sheetW: settings.sheetW, sheetH: settings.sheetH, gap: settings.gap, margin: settings.margin, startBox: box, zones }
  }) : startJob({
    kind: 'nest', parts: refs.map(r => r.part),
    anglesList: refs.map(r => (r.design.rotation === 'fixed' ? [0] : settings.angles)),
    options: { sheetW: settings.sheetW, sheetH: settings.sheetH, gap: settings.gap, margin: settings.margin, seconds: settings.seconds, startBox: box, zones, fill: settings.fill }
  }, p => {
    if (typeof p !== 'number') uiStore.patch({ job: { kind: 'nest', progress: p.t, sheets: p.sheets, pass: p.pass, stage: p.stage } });
  });
  running = job;
  try {
    const result = await job.promise;
    addLayout(layoutFromNest(result, refs, settings, zones, start, number));
    if (result.unplaced.length) toast(tr('toast.unplaced', { n: result.unplaced.length }), true);
  } catch (e) {
    if (e instanceof JobCancelled) toast(tr('toast.cancelled'));
    else toast(tr('toast.failed', { why: e instanceof Error ? e.message : String(e) }), true);
  }
  running = null;
  uiStore.patch({ job: null });
}

/** Keeps toolpaths in step with what is on screen; a newer request replaces an older one. */
let pathJob: RunningJob<unknown> | null = null;
export async function refreshToolpaths(): Promise<void> {
  const state = projectStore.get(), layout = activeLayout(state.project), { cut } = state.project.settings;
  // When the profile was last verified does not change a single move.
  const { verifiedAt: _, ...profile } = activeProfile(state);
  const key = layout ? layout.id + ':' + JSON.stringify([layout.sheets.map(s => s.pieces.map(p => [p.key, p.deg, p.tx, p.ty])), profile, cut]) : null;
  if (key === uiStore.get().toolpathKey) return;
  pathJob?.cancel();
  pathJob = null;
  if (!layout) { uiStore.patch({ toolpaths: null, toolpathKey: null, toolpathBusy: false, confirmed: false }); return; }
  const designs = state.project.designs;
  uiStore.patch({ toolpathBusy: true, confirmed: false, playback: { ...uiStore.get().playback, position: 0, playing: false } });
  const job = startJob({
    kind: 'strokes', cut, sheets: layout.sheets.map(s => ({ items: sheetItems(s, designs), start: s.start })),
    sheetW: layout.sheetW, sheetH: layout.sheetH, zones: layout.zones, gap: layout.gap, margin: layout.margin, mode: layout.mode, profile
  });
  pathJob = job;
  try {
    const result = await job.promise;
    if (pathJob === job) { uiStore.patch({ toolpaths: result, toolpathKey: key, toolpathBusy: false }); pathJob = null; }
  } catch (e) {
    if (e instanceof JobCancelled) return;
    uiStore.patch({ toolpathBusy: false });
    toast(tr('toast.failed', { why: e instanceof Error ? e.message : String(e) }), true);
  }
}

/* ---------- output ---------- */
function exportContext() {
  const { project } = projectStore.get(), layout = activeLayout(project), paths = uiStore.get().toolpaths;
  if (!layout || !paths) return null;
  return { project, layout, paths, profile: activeProfile(projectStore.get()) };
}

export function canExportMachineFiles(): boolean {
  const { toolpaths, confirmed, toolpathBusy } = uiStore.get();
  return !!toolpaths && !toolpathBusy && confirmed && !hasBlocking(toolpaths.issues);
}

export function tapOf(i: number): { name: string; text: string } | null {
  const c = exportContext();
  if (!c) return null;
  const name = sheetFileName(c.project.baseName, i) + '.tap';
  return { name, text: toTAP(c.paths.sheets[i].stroke.path, { name, feed: c.profile.feed, power: c.profile.power, m5: c.profile.m5, date: tapDate() }) };
}

function svgOf(i: number): { name: string; text: string } | null {
  const c = exportContext();
  if (!c) return null;
  const sheet = c.layout.sheets[i], box = 'box' in sheet.start ? sheet.start.box : null;
  return { name: sheetFileName(c.project.baseName, i) + '.svg', text: toSVG(sheetItems(sheet, c.project.designs), c.layout.sheetW, c.layout.sheetH, box) };
}

export function downloadTap(i: number): void {
  if (!canExportMachineFiles()) { toast(tr('toast.confirmFirst'), true); return; }
  const f = tapOf(i);
  if (f) { saveFile(f.name, f.text, 'text/plain'); toast(tr('toast.saved', { name: f.name })); }
}

export function downloadSvg(i: number): void {
  const f = svgOf(i);
  if (f) { saveFile(f.name, f.text, 'image/svg+xml'); toast(tr('toast.saved', { name: f.name })); }
}

export function downloadZip(): void {
  if (!canExportMachineFiles()) { toast(tr('toast.confirmFirst'), true); return; }
  const c = exportContext();
  if (!c) return;
  const files = c.layout.sheets.flatMap((_, i) => {
    const t = tapOf(i)!, s = svgOf(i)!;
    return [{ name: t.name, data: t.text }, { name: s.name, data: s.text }];
  });
  const name = cleanBaseName(c.project.baseName) + '.zip';
  saveFile(name, makeZip(files), 'application/zip');
  toast(tr('toast.saved', { name }));
}

export function downloadProject(): void {
  const state = projectStore.get();
  const name = cleanBaseName(state.project.name) + '.rieb-snor.json';
  saveFile(name, toProjectFile(state.project, activeProfile(state)), 'application/json');
  toast(tr('toast.saved', { name }));
}

export async function createProject(): Promise<void> {
  await flushSave();
  const n = newProject(tr('project.defaultName'));
  loadInto(n);
  uiStore.patch({ selected: [], sheet: 0, failures: [], toolpathKey: null });
  go('import');
  await flushSave();
}
