import type { VItem } from '../../engines/vector-engine/types';
import { Store } from '../../stores/store';

export type DesignTool = 'pick' | 'pan' | 'zoom' | 'rect' | 'ellipse' | 'polygon' | 'star' | 'spiral' | 'grid' | 'line' | 'polyline' | 'freehand';
export type PropsTab = 'object' | 'style' | 'layers' | 'page';

export interface DesignState {
  tool: DesignTool;
  selected: string[];
  /** Screen pixels per millimetre. */
  zoom: number;
  /** Page coordinate shown at the canvas's top-left corner. */
  pan: { x: number; y: number };
  /** Set when the canvas should fit the page on its next layout. */
  fit: 'page' | 'selection' | null;
  cursor: [number, number] | null;
  /** Beginner hides the less common tools and commands. */
  mode: 'beginner' | 'advanced';
  grid: boolean;
  rulers: boolean;
  snap: boolean;
  gridMm: number;
  /** Duplicate and paste offset in mm. */
  nudge: number;
  sides: number;
  points: number;
  inner: number;
  turns: number;
  cols: number;
  rows: number;
  /** Command ids shown on the main toolbar, in order. */
  toolbar: string[];
  toolbox: boolean;
  props: boolean;
  propsTab: PropsTab;
  menu: string | null;
  /** Copied objects; kept in memory only. */
  clipboard: VItem[];
  pasteCount: number;
}

export const DEFAULT_TOOLBAR = [
  'file.new', 'file.open', 'file.save', '|', 'edit.undo', 'edit.redo', '|', 'file.importSvg', 'file.exportSvg', '|',
  'object.group', 'object.ungroup', 'path.combine', 'path.breakApart', '|', 'arrange.alignLeft', 'arrange.alignCenter', 'arrange.alignRight',
  'arrange.distributeH', '|', 'view.fitPage', 'view.snap', 'window.layers', '|', 'cnc.send', 'cnc.nesting', 'cnc.toolpath', 'cnc.export'
];

const KEY = 'rieb-snor.design';
type Saved = Pick<DesignState, 'mode' | 'grid' | 'rulers' | 'snap' | 'gridMm' | 'nudge' | 'toolbar' | 'toolbox' | 'props'>;
function read(): Partial<Saved> {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}
const saved = read();
const n = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && v >= lo && v <= hi ? v : d);

export const designStore = new Store<DesignState>({
  tool: 'pick', selected: [], zoom: 1, pan: { x: -20, y: -20 }, fit: 'page', cursor: null,
  mode: saved.mode === 'advanced' ? 'advanced' : 'beginner',
  grid: saved.grid !== false, rulers: saved.rulers !== false, snap: saved.snap === true,
  gridMm: n(saved.gridMm, 1, 100, 10), nudge: n(saved.nudge, 0, 1000, 10),
  sides: 6, points: 5, inner: 0.45, turns: 3, cols: 4, rows: 3,
  toolbar: Array.isArray(saved.toolbar) ? saved.toolbar.filter((x): x is string => typeof x === 'string').slice(0, 60) : DEFAULT_TOOLBAR,
  toolbox: saved.toolbox !== false, props: saved.props !== false, propsTab: 'object', menu: null, clipboard: [], pasteCount: 0
});

export function saveDesignPrefs(): void {
  const { mode, grid, rulers, snap, gridMm, nudge, toolbar, toolbox, props } = designStore.get();
  try { localStorage.setItem(KEY, JSON.stringify({ mode, grid, rulers, snap, gridMm, nudge, toolbar, toolbox, props })); } catch { /* preferences reset next time */ }
}

export const ZOOM = { min: 0.05, max: 64 };
