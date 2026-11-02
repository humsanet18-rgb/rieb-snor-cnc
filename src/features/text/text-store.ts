import { tr } from '../../app/i18n';
import type { BuildResult } from '../../engines/geometry-engine/parts';
import { toSVG } from '../../engines/export/svg-export';
import { saveFile } from '../../services/download';
import { startJob } from '../../services/engine-client';
import { commit, projectStore } from '../../stores/project-store';
import { Store } from '../../stores/store';
import { go, toast } from '../../stores/ui-store';
import { summarise, textDesign, type TextSummary } from './geometry';
import { BUNDLED_FONTS, findSystemFonts, loadFontFile, referenceRatio, renderText, TextRenderError, type FontChoice, type TextRenderCode, type TextRenderResult } from './render';

export const MAX_CHARS = 300, MIN_HEIGHT = 5, MAX_HEIGHT = 1000;

export interface TextDraft { text: string; fontId: string; refGlyph: string; refHeight: number; align: 'left' | 'center' | 'right'; lineGap: number }

export interface TextState extends TextDraft {
  fonts: FontChoice[];
  fontsScanned: boolean;
  /** Each step is done for one set of inputs; changing the text or settings re-opens it. */
  previewKey: string | null;
  acceptedKey: string | null;
  addedKey: string | null;
  result: { key: string; render: TextRenderResult; built: BuildResult; summary: TextSummary } | null;
  busy: { stage: 'render' | 'build'; done: number; total: number } | null;
  error: TextRenderCode | null;
  /** Reference glyph height over font size, for the live preview. */
  ratio: { font: string; glyph: string; value: number } | null;
}

const DRAFT = 'rieb-snor.text';
function readDraft(): Partial<TextDraft> {
  try { return JSON.parse(localStorage.getItem(DRAFT) || '{}'); } catch { return {}; }
}
const draft = readDraft();

export const textStore = new Store<TextState>({
  text: typeof draft.text === 'string' ? draft.text.slice(0, MAX_CHARS) : '',
  fontId: typeof draft.fontId === 'string' && draft.fontId.startsWith('system-') ? draft.fontId : BUNDLED_FONTS.some(f => f.id === draft.fontId) ? draft.fontId! : BUNDLED_FONTS[0].id,
  refGlyph: typeof draft.refGlyph === 'string' && draft.refGlyph.trim() ? draft.refGlyph : 'ក',
  refHeight: typeof draft.refHeight === 'number' && draft.refHeight >= MIN_HEIGHT && draft.refHeight <= MAX_HEIGHT ? draft.refHeight : 120,
  align: draft.align === 'left' || draft.align === 'right' ? draft.align : 'center',
  lineGap: typeof draft.lineGap === 'number' && draft.lineGap >= 0 ? draft.lineGap : 20,
  fonts: BUNDLED_FONTS, fontsScanned: false,
  previewKey: null, acceptedKey: null, addedKey: null, result: null, busy: null, error: null, ratio: null
});

export const inputKey = (s: TextDraft): string => JSON.stringify([s.text, s.fontId, s.refGlyph, s.refHeight, s.align, s.lineGap]);
export const fontOf = (s: TextState): FontChoice | undefined => s.fonts.find(f => f.id === s.fontId);

export type TextProblem = 'empty' | 'long' | 'font' | 'height' | 'glyph';
/** What stops a step, if anything. */
export function textProblems(s: TextState): { text: TextProblem | null; settings: TextProblem | null } {
  const text = !s.text.trim() ? 'empty' : s.text.length > MAX_CHARS ? 'long' : null;
  const glyph = [...s.refGlyph.trim()];
  const settings = !fontOf(s) ? 'font' : !(s.refHeight >= MIN_HEIGHT && s.refHeight <= MAX_HEIGHT) ? 'height' : !glyph.length || glyph.length > 4 ? 'glyph' : null;
  return { text, settings };
}

export function editText(part: Partial<TextDraft>): void {
  textStore.patch({ ...part, error: null });
  const { text, fontId, refGlyph, refHeight, align, lineGap } = textStore.get();
  try { localStorage.setItem(DRAFT, JSON.stringify({ text, fontId, refGlyph, refHeight, align, lineGap })); } catch { /* the draft is only a convenience */ }
}

export function scanFonts(): void {
  if (textStore.get().fontsScanned) return;
  const found = findSystemFonts(), uploaded = textStore.get().fonts.filter(f => f.source === 'file');
  textStore.patch({ fonts: [...BUNDLED_FONTS, ...found, ...uploaded], fontsScanned: true });
  if (!fontOf(textStore.get())) editText({ fontId: BUNDLED_FONTS[0].id });
}

export async function addFontFile(file: File): Promise<void> {
  try {
    const font = await loadFontFile(file);
    textStore.patch({ fonts: [...textStore.get().fonts, font] });
    editText({ fontId: font.id });
  } catch (e) {
    textStore.patch({ error: e instanceof TextRenderError ? e.code : 'font-bad' });
  }
}

/** Measures the reference glyph for the live preview; cheap, and cached per font and glyph. */
export async function measureRatio(): Promise<void> {
  const s = textStore.get(), font = fontOf(s), glyph = s.refGlyph.trim();
  if (!font || !glyph || (s.ratio?.font === font.id && s.ratio.glyph === glyph)) return;
  try {
    const value = await referenceRatio(font, glyph);
    const now = textStore.get();
    if (now.fontId === font.id && now.refGlyph.trim() === glyph) textStore.patch({ ratio: { font: font.id, glyph, value } });
  } catch (e) {
    textStore.patch({ ratio: null, error: e instanceof TextRenderError ? e.code : null });
  }
}

export function confirmPreview(): void {
  textStore.patch({ previewKey: inputKey(textStore.get()) });
}

export async function convertText(): Promise<void> {
  const s = textStore.get(), font = fontOf(s);
  if (!font || s.busy) return;
  const key = inputKey(s);
  textStore.patch({ busy: { stage: 'render', done: 0, total: 1 }, error: null, result: null, acceptedKey: null });
  try {
    const render = await renderText({ text: s.text, font, refGlyph: s.refGlyph.trim(), refHeight: s.refHeight, align: s.align, lineGap: s.lineGap },
      (done, total) => textStore.patch({ busy: { stage: 'render', done, total } }));
    textStore.patch({ busy: { stage: 'build', done: 0, total: 1 } });
    const built = await startJob({ kind: 'parts', polys: render.rings }).promise;
    const st = projectStore.get().project.settings;
    const summary = summarise(built, { w: st.sheetW, h: st.sheetH, margin: st.margin });
    // Inputs edited while converting make this result belong to text that is no longer on screen.
    if (inputKey(textStore.get()) === key) textStore.patch({ result: { key, render, built, summary }, busy: null });
    else textStore.patch({ busy: null });
  } catch (e) {
    textStore.patch({ busy: null, error: e instanceof TextRenderError ? e.code : 'blank' });
    if (!(e instanceof TextRenderError)) toast(tr('toast.failed', { why: e instanceof Error ? e.message : String(e) }), true);
  }
}

export function acceptOutlines(): void {
  textStore.patch({ acceptedKey: inputKey(textStore.get()) });
}

export function addToProject(): void {
  const s = textStore.get(), font = fontOf(s);
  if (!s.result || !font) return;
  const design = textDesign(s.text, font.label, s.result.built, s.result.render.rings.length);
  commit(p => ({ ...p, designs: [...p.designs, design] }));
  textStore.patch({ addedKey: s.result.key });
  toast(tr('text.added', { name: design.name }));
  go('nest');
}

export function downloadTextSvg(): void {
  const s = textStore.get();
  if (!s.result) return;
  const items = s.result.built.parts.map(p => ({ outers: p.outers, holes: p.holes, area: p.area }));
  const w = Math.ceil(s.result.summary.width) + 1, h = Math.ceil(s.result.summary.height) + 1;
  const name = `khmer-text-${s.refHeight}mm.svg`;
  saveFile(name, toSVG(items, w, h, null), 'image/svg+xml');
  toast(tr('toast.saved', { name }));
}

export function restartText(): void {
  editText({ text: '' });
  textStore.patch({ previewKey: null, acceptedKey: null, addedKey: null, result: null });
}
