import type { StrokeResult } from '../workers/jobs';
import type { ImportIssueCode } from '../engines/svg-parser/report';
import type { Point } from '../types/geometry';
import { Store } from './store';

export type Lang = 'km' | 'en';
export type Theme = 'light' | 'dark';
export type Dialog = 'open' | 'help' | 'settings' | { report: string } | null;

export interface Layers { designs: boolean; toolpath: boolean; bridges: boolean; zones: boolean; start: boolean; grid: boolean; order: boolean }

export interface JobState {
  kind: 'import' | 'nest' | 'strokes' | 'export';
  stage?: 'search' | 'fine';
  progress: number; sheets: number; pass: number; done?: number; total?: number; name?: string;
}

export interface ImportFailure { name: string; code: ImportIssueCode; detail?: string }

export interface UiState {
  lang: Lang;
  theme: Theme;
  step: number;
  dialog: Dialog;
  selected: string | null;
  sheet: number;
  layers: Layers;
  job: JobState | null;
  toolpaths: StrokeResult | null;
  /** The layout object these toolpaths belong to; anything else means they are out of date. */
  toolpathKey: unknown;
  toolpathBusy: boolean;
  toast: { text: string; bad: boolean; id: number } | null;
  failures: ImportFailure[];
  confirmed: boolean;
  playback: { position: number; playing: boolean; speed: number };
  view: 'work' | 'editor';
  /** Keeps the wire centred while the editor plays it back. */
  follow: boolean;
  flash: Point | null;
}

const PREFS = 'rieb-snor.prefs';
function readPrefs(): Partial<Pick<UiState, 'lang' | 'theme' | 'layers'>> {
  try { return JSON.parse(localStorage.getItem(PREFS) || '{}'); } catch { return {}; }
}
const prefs = readPrefs();

export const uiStore = new Store<UiState>({
  lang: prefs.lang === 'en' ? 'en' : 'km',
  theme: prefs.theme === 'dark' ? 'dark' : prefs.theme === 'light' ? 'light' : (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  step: 1, dialog: null, selected: null, sheet: 0,
  layers: { designs: true, toolpath: true, bridges: true, zones: true, start: true, grid: true, order: false, ...prefs.layers },
  job: null, toolpaths: null, toolpathKey: null, toolpathBusy: false, toast: null, failures: [], confirmed: false,
  playback: { position: 0, playing: false, speed: 10 }, view: 'work', follow: false, flash: null
});

export function savePrefs(): void {
  const { lang, theme, layers } = uiStore.get();
  try { localStorage.setItem(PREFS, JSON.stringify({ lang, theme, layers })); } catch { /* preferences just reset next time */ }
}

let toastTimer: ReturnType<typeof setTimeout> | undefined, toastId = 0;
export function toast(text: string, bad = false): void {
  clearTimeout(toastTimer);
  uiStore.patch({ toast: { text, bad, id: ++toastId } });
  toastTimer = setTimeout(() => uiStore.patch({ toast: null }), bad ? 6000 : 3500);
}
