import type { IconName } from '../components/icons';
import { go, openModal, savePrefs, uiStore, type Section, type ToolModal, type UiState } from '../stores/ui-store';
import type { Key } from './i18n';
import type { FlowStep } from './sections';

/**
 * Everything the dock can do. A tool either opens a screen (`section`), opens a workflow modal (`modal`),
 * or changes the canvas (`canvas`). The dock, phone navigation, Home and the "Next" buttons all go through here.
 */
export type ToolId =
  | 'select' | 'pan' | 'layers'
  | 'import-svg' | 'designs' | 'text' | 'nest'
  | 'path' | 'machine' | 'gcode' | 'simulation' | 'export'
  | 'home' | 'projects' | 'shop' | 'settings';

export type ToolGroup = 'canvas' | 'design' | 'produce' | 'manage';

export interface ToolDef {
  id: ToolId; icon: IconName; label: Key; group: ToolGroup;
  /** Test id kept from the earlier side rail where one existed. */
  testId: string;
  section?: Section; modal?: ToolModal; flow?: FlowStep;
}

export const TOOLS: ToolDef[] = [
  { id: 'select', icon: 'pointer', label: 'tool.select', group: 'canvas', testId: 'dock-select' },
  { id: 'pan', icon: 'hand', label: 'tool.pan', group: 'canvas', testId: 'dock-pan' },
  { id: 'layers', icon: 'layers', label: 'canvas.layers', group: 'canvas', testId: 'dock-layers' },
  { id: 'import-svg', icon: 'upload', label: 'tool.importSvg', group: 'design', testId: 'nav-import-svg', modal: 'import' },
  { id: 'designs', icon: 'file', label: 'nav.section.import', group: 'design', testId: 'nav-import', section: 'import', flow: 'import' },
  { id: 'text', icon: 'text', label: 'nav.section.text', group: 'design', testId: 'nav-text', modal: 'text' },
  { id: 'nest', icon: 'nest', label: 'nav.section.nest', group: 'design', testId: 'nav-nest', section: 'nest', flow: 'nest' },
  { id: 'path', icon: 'path', label: 'nav.section.path', group: 'produce', testId: 'nav-path', section: 'path', flow: 'path' },
  { id: 'machine', icon: 'machine', label: 'nav.section.machine', group: 'produce', testId: 'nav-machine', modal: 'machine', flow: 'machine' },
  { id: 'gcode', icon: 'code', label: 'tool.gcode', group: 'produce', testId: 'nav-gcode', modal: 'gcode' },
  { id: 'simulation', icon: 'editor', label: 'nav.section.editor', group: 'produce', testId: 'nav-editor', section: 'editor' },
  { id: 'export', icon: 'download', label: 'nav.section.export', group: 'produce', testId: 'nav-export', modal: 'export', flow: 'export' },
  { id: 'home', icon: 'home', label: 'nav.section.home', group: 'manage', testId: 'nav-home', section: 'home' },
  { id: 'projects', icon: 'history', label: 'nav.section.projects', group: 'manage', testId: 'nav-projects', section: 'projects' },
  { id: 'shop', icon: 'shop', label: 'nav.section.shop', group: 'manage', testId: 'nav-shop', section: 'shop' },
  { id: 'settings', icon: 'gear', label: 'nav.section.settings', group: 'manage', testId: 'nav-settings', section: 'settings' }
];

export const toolOf = (id: ToolId): ToolDef => TOOLS.find(t => t.id === id)!;
export const toolForSection = (s: Section): ToolDef => TOOLS.find(t => t.section === s)!;
export const toolForFlow = (s: FlowStep): ToolDef => TOOLS.find(t => t.flow === s)!;

/** Canvas tools act on the sheet, so they bring the operator back to a screen that shows it. */
const WITH_CANVAS: Section[] = ['import', 'nest', 'path', 'editor'];

export function runTool(id: ToolId): void {
  const tool = toolOf(id), ui = uiStore.get();
  if (tool.section) { go(tool.section); return; }
  if (tool.modal) { openModal(tool.modal); return; }
  if (!WITH_CANVAS.includes(ui.section)) go('nest');
  if (id === 'layers') uiStore.patch({ layersOpen: !uiStore.get().layersOpen, drawer: null });
  else uiStore.patch({ tool: id as UiState['tool'], drawer: null });
}

/** Whether a tool is the one in use, for highlighting it in the dock. */
export function isActive(tool: ToolDef, ui: Pick<UiState, 'section' | 'tool' | 'layersOpen'>): boolean {
  if (tool.section) return ui.section === tool.section;
  if (tool.id === 'layers') return ui.layersOpen;
  if (tool.group === 'canvas') return WITH_CANVAS.includes(ui.section) && ui.tool === tool.id;
  return false;
}

export function togglePin(id: ToolId): void {
  const pinned = uiStore.get().pinned;
  uiStore.patch({ pinned: pinned.includes(id) ? pinned.filter(x => x !== id) : [...pinned, id] });
  savePrefs();
}
