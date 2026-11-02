import type { StrokeResult } from '../workers/jobs';
import type { ImportIssueCode } from '../engines/svg-parser/report';
import type { Point } from '../types/geometry';
import { Store } from './store';

export type Lang = 'km' | 'en';
export type Theme = 'light' | 'dark';
export type Dialog = 'help' | { report: string } | null;

/** Every screen in the app. The work sections share the sheet canvas; the others are full pages. */
export type Section = 'home' | 'import' | 'text' | 'nest' | 'machine' | 'path' | 'export' | 'editor' | 'projects' | 'shop' | 'settings';
export const WORK_SECTIONS: Section[] = ['import', 'nest', 'machine', 'path', 'export', 'editor'];

export interface Layers {
  designs: boolean; toolpath: boolean; direction: boolean; bridges: boolean; zones: boolean; start: boolean;
  grid: boolean; order: boolean; rows: boolean; issues: boolean; dims: boolean;
}

export interface JobState {
  kind: 'import' | 'nest' | 'strokes' | 'export';
  stage?: 'search' | 'fine';
  progress: number; sheets: number; pass: number; done?: number; total?: number; name?: string;
}

export interface ImportFailure { name: string; code: ImportIssueCode; detail?: string }

export type ShopTab = 'dashboard' | 'orders' | 'production' | 'customers' | 'stock' | 'money' | 'reports' | 'settings';

export interface UiState {
  lang: Lang;
  theme: Theme;
  section: Section;
  /** Docked side panels on wide screens. */
  panels: { left: boolean; right: boolean };
  /** The panel shown over the canvas on narrow screens, if any. */
  drawer: 'left' | 'right' | 'menu' | null;
  dialog: Dialog;
  selected: string[];
  sheet: number;
  layers: Layers;
  /** Row of the cutting sequence picked in the row list, drawn emphasised on the canvas. */
  highlightRow: number | null;
  job: JobState | null;
  toolpaths: StrokeResult | null;
  /** The layout object these toolpaths belong to; anything else means they are out of date. */
  toolpathKey: unknown;
  toolpathBusy: boolean;
  toast: { text: string; bad: boolean; id: number } | null;
  failures: ImportFailure[];
  confirmed: boolean;
  playback: { position: number; playing: boolean; speed: number };
  shopTab: ShopTab;
  /** The order open in its detail dialog. */
  shopOrder: string | null;
  /** Keeps the wire centred while the editor plays it back. */
  follow: boolean;
  flash: Point | null;
  /** The first-run guide on the home screen has been dismissed. */
  guided: boolean;
}

const PREFS = 'rieb-snor.prefs';
type Prefs = Partial<Pick<UiState, 'lang' | 'theme' | 'layers' | 'panels' | 'guided'>>;
function readPrefs(): Prefs {
  try { return JSON.parse(localStorage.getItem(PREFS) || '{}'); } catch { return {}; }
}
const prefs = readPrefs();

export const uiStore = new Store<UiState>({
  lang: prefs.lang === 'en' ? 'en' : 'km',
  theme: prefs.theme === 'dark' ? 'dark' : prefs.theme === 'light' ? 'light' : (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  section: 'home', panels: { left: true, right: true, ...prefs.panels }, drawer: null,
  dialog: null, selected: [], sheet: 0, highlightRow: null,
  layers: { designs: true, toolpath: true, direction: true, bridges: true, zones: true, start: true, grid: true, order: false, rows: true, issues: true, dims: true, ...prefs.layers },
  job: null, toolpaths: null, toolpathKey: null, toolpathBusy: false, toast: null, failures: [], confirmed: false,
  playback: { position: 0, playing: false, speed: 10 }, shopTab: 'dashboard', shopOrder: null, follow: false, flash: null,
  guided: prefs.guided === true
});

export function savePrefs(): void {
  const { lang, theme, layers, panels, guided } = uiStore.get();
  try { localStorage.setItem(PREFS, JSON.stringify({ lang, theme, layers, panels, guided })); } catch { /* preferences just reset next time */ }
}

/** Opens a screen; on narrow screens the work panel slides up so its controls are at hand. */
export function go(section: Section): void {
  uiStore.patch({ section, drawer: WORK_SECTIONS.includes(section) || section === 'text' ? 'left' : null, highlightRow: null });
}

/** Widths below which a panel floats over the canvas instead of sitting beside it; they match the stylesheet. */
const NARROW = { left: '(max-width: 899px)', right: '(max-width: 1199px)' };
export const isNarrow = (side: 'left' | 'right'): boolean => typeof matchMedia === 'function' && matchMedia(NARROW[side]).matches;

/** Collapses a docked panel on wide screens, or opens and closes its drawer on narrow ones. */
export function togglePanel(side: 'left' | 'right'): void {
  const s = uiStore.get();
  if (isNarrow(side)) { uiStore.patch({ drawer: s.drawer === side ? null : side }); return; }
  uiStore.patch({ panels: { ...s.panels, [side]: !s.panels[side] } });
  savePrefs();
}

let toastTimer: ReturnType<typeof setTimeout> | undefined, toastId = 0;
export function toast(text: string, bad = false): void {
  clearTimeout(toastTimer);
  uiStore.patch({ toast: { text, bad, id: ++toastId } });
  toastTimer = setTimeout(() => uiStore.patch({ toast: null }), bad ? 6000 : 3500);
}
