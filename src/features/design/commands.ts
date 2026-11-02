import { createProject, downloadProject } from '../../app/actions';
import { saveNow } from '../../app/TopBar';
import type { Key } from '../../app/i18n';
import type { IconName } from '../../components/icons';
import { activeLayout, projectStore, redo, undo } from '../../stores/project-store';
import { go, openModal, savePrefs, uiStore } from '../../stores/ui-store';
import {
  alignSelection, breakApartSelection, combineSelection, copySelection, cutSelection, deleteSelection, distributeSelection,
  duplicateSelection, exportSvg, fitPage, fitSelection, flipSelection, groupSelection, hasHidden, hasLocked, hasSelection, hideSelection,
  lockSelection, newLayer, orderSelection, pageFromSheet, paste, reverseSelection, rotateSelection, selectAll, selection, sendToProduction,
  showAll, ungroupSelection, unlockAll, zoomBy, currentDoc
} from './actions';
import { designStore, saveDesignPrefs, type DesignState } from './design-store';
import { findTop } from '../../engines/vector-engine/document';

export interface Command {
  id: string;
  label: Key;
  icon?: IconName;
  /** Shown in menus and the palette, and matched by the keyboard handler. */
  keys?: string;
  run: () => void;
  enabled?: () => boolean;
  /** For toggles: whether it is on. */
  checked?: () => boolean;
  /** Hidden in beginner mode. */
  advanced?: boolean;
}

const sel = (n = 1) => () => hasSelection(n);
const toggle = (key: 'grid' | 'rulers' | 'snap' | 'toolbox' | 'props') => () => { designStore.patch({ [key]: !designStore.get()[key] } as Partial<DesignState>); saveDesignPrefs(); };
const on = (key: 'grid' | 'rulers' | 'snap' | 'toolbox' | 'props') => () => designStore.get()[key];
const hasGroup = () => { const doc = currentDoc(); return selection().some(id => findTop(doc, id)?.item.type === 'group'); };
const hasPaths = () => { const doc = currentDoc(); return selection().some(id => findTop(doc, id)?.item.type === 'path'); };
const multiPath = () => { const doc = currentDoc(); return selection().some(id => { const i = findTop(doc, id)?.item; return i?.type === 'path' && i.subpaths.length > 1; }); };
const props = (tab: DesignState['propsTab']) => () => { designStore.patch({ props: true, propsTab: tab }); saveDesignPrefs(); };
const dialog = (design: 'palette' | 'shortcuts' | 'customize') => () => uiStore.patch({ dialog: { design } });
const hasLayout = () => !!activeLayout(projectStore.get().project);

export const COMMANDS: Command[] = [
  { id: 'file.new', label: 'nav.new', icon: 'new', run: () => void createProject().then(() => go('design')) },
  { id: 'file.open', label: 'nav.open', icon: 'open', keys: 'Ctrl+O', run: () => go('projects') },
  { id: 'file.save', label: 'nav.save', icon: 'save', keys: 'Ctrl+S', run: () => void saveNow() },
  { id: 'file.saveAs', label: 'design.cmd.saveAs', icon: 'download', keys: 'Ctrl+Shift+S', run: downloadProject },
  { id: 'file.importSvg', label: 'design.cmd.importSvg', icon: 'upload', keys: 'Ctrl+I', run: () => document.querySelector<HTMLInputElement>('[data-testid="design-file-input"]')?.click() },
  { id: 'file.exportSvg', label: 'design.cmd.exportSvg', icon: 'download', keys: 'Ctrl+E', run: exportSvg },
  { id: 'file.preferences', label: 'nav.section.settings', icon: 'gear', run: () => go('settings') },

  { id: 'edit.undo', label: 'nav.undo', icon: 'undo', keys: 'Ctrl+Z', run: undo, enabled: () => projectStore.get().past.length > 0 },
  { id: 'edit.redo', label: 'nav.redo', icon: 'redo', keys: 'Ctrl+Y', run: redo, enabled: () => projectStore.get().future.length > 0 },
  { id: 'edit.cut', label: 'design.cmd.cut', icon: 'scissors', keys: 'Ctrl+X', run: cutSelection, enabled: sel() },
  { id: 'edit.copy', label: 'design.cmd.copy', icon: 'copy', keys: 'Ctrl+C', run: copySelection, enabled: sel() },
  { id: 'edit.paste', label: 'design.cmd.paste', icon: 'paste', keys: 'Ctrl+V', run: paste, enabled: () => designStore.get().clipboard.length > 0 },
  { id: 'edit.duplicate', label: 'design.cmd.duplicate', icon: 'copy', keys: 'Ctrl+D', run: duplicateSelection, enabled: sel() },
  { id: 'edit.delete', label: 'design.cmd.delete', icon: 'trash', keys: 'Delete', run: deleteSelection, enabled: sel() },
  { id: 'edit.selectAll', label: 'tool.selectAll', icon: 'selectAll', keys: 'Ctrl+A', run: selectAll },
  { id: 'edit.deselect', label: 'menu.deselect', icon: 'close', keys: 'Esc', run: () => designStore.patch({ selected: [] }), enabled: () => designStore.get().selected.length > 0 },

  { id: 'view.zoomIn', label: 'canvas.zoomIn', icon: 'plus', keys: '+', run: () => zoomBy(1.25) },
  { id: 'view.zoomOut', label: 'canvas.zoomOut', icon: 'minus', keys: '-', run: () => zoomBy(0.8) },
  { id: 'view.zoom100', label: 'design.cmd.zoom100', icon: 'zoom', keys: 'Ctrl+1', run: () => designStore.patch({ fit: null, zoom: 96 / 25.4 }) },
  { id: 'view.fitPage', label: 'design.cmd.fitPage', icon: 'fit', keys: 'Shift+F4', run: fitPage },
  { id: 'view.fitSelection', label: 'design.cmd.fitSelection', icon: 'target', keys: 'Shift+F2', run: fitSelection, enabled: sel() },
  { id: 'view.grid', label: 'design.cmd.grid', icon: 'grid', run: toggle('grid'), checked: on('grid') },
  { id: 'view.rulers', label: 'design.cmd.rulers', icon: 'ruler', run: toggle('rulers'), checked: on('rulers') },
  { id: 'view.snap', label: 'design.cmd.snap', icon: 'magnet', run: toggle('snap'), checked: on('snap') },
  { id: 'view.theme', label: 'design.cmd.theme', icon: 'moon', run: () => { const s = uiStore.get(); uiStore.patch({ theme: s.theme === 'dark' ? 'light' : 'dark' }); savePrefs(); } },

  { id: 'layout.pageFromSheet', label: 'design.cmd.pageFromSheet', icon: 'ruler', run: pageFromSheet },
  { id: 'layout.page', label: 'design.cmd.pageSetup', icon: 'file', run: props('page') },
  { id: 'layout.newLayer', label: 'design.cmd.newLayer', icon: 'layers', run: newLayer },

  { id: 'object.group', label: 'design.cmd.group', icon: 'group', keys: 'Ctrl+G', run: groupSelection, enabled: sel(2) },
  { id: 'object.ungroup', label: 'design.cmd.ungroup', icon: 'ungroup', keys: 'Ctrl+U', run: ungroupSelection, enabled: hasGroup },
  { id: 'object.transform', label: 'design.cmd.transform', icon: 'sliders', keys: 'Alt+F7', run: props('object'), enabled: sel() },
  { id: 'object.rotateCw', label: 'design.cmd.rotateCw', icon: 'rotate', run: () => rotateSelection(90), enabled: sel() },
  { id: 'object.rotateCcw', label: 'design.cmd.rotateCcw', icon: 'rotate', run: () => rotateSelection(-90), enabled: sel() },
  { id: 'object.flipH', label: 'design.cmd.flipH', icon: 'flipH', run: () => flipSelection('h'), enabled: sel() },
  { id: 'object.flipV', label: 'design.cmd.flipV', icon: 'flipV', run: () => flipSelection('v'), enabled: sel() },
  { id: 'object.lock', label: 'design.cmd.lock', icon: 'lock', run: lockSelection, enabled: sel(), advanced: true },
  { id: 'object.unlockAll', label: 'design.cmd.unlockAll', icon: 'unlock', run: unlockAll, enabled: hasLocked, advanced: true },
  { id: 'object.hide', label: 'design.cmd.hide', icon: 'eyeOff', run: hideSelection, enabled: sel(), advanced: true },
  { id: 'object.showAll', label: 'design.cmd.showAll', icon: 'eye', run: showAll, enabled: hasHidden, advanced: true },

  { id: 'text.khmer', label: 'design.cmd.khmerText', icon: 'text', keys: 'F8', run: () => openModal('text') },

  { id: 'arrange.alignLeft', label: 'align.left', icon: 'alignLeft', keys: 'L', run: () => alignSelection('left'), enabled: sel() },
  { id: 'arrange.alignCenter', label: 'align.center', icon: 'alignCenter', keys: 'C', run: () => alignSelection('center'), enabled: sel() },
  { id: 'arrange.alignRight', label: 'align.right', icon: 'alignRight', keys: 'R', run: () => alignSelection('right'), enabled: sel() },
  { id: 'arrange.alignTop', label: 'align.top', icon: 'alignTop', keys: 'T', run: () => alignSelection('top'), enabled: sel() },
  { id: 'arrange.alignMiddle', label: 'align.middle', icon: 'alignMiddle', keys: 'E', run: () => alignSelection('middle'), enabled: sel() },
  { id: 'arrange.alignBottom', label: 'align.bottom', icon: 'alignBottom', keys: 'B', run: () => alignSelection('bottom'), enabled: sel() },
  { id: 'arrange.centerPage', label: 'design.cmd.centerPage', icon: 'target', keys: 'P', run: () => { alignSelection('center', true); alignSelection('middle', true); }, enabled: sel() },
  { id: 'arrange.distributeH', label: 'align.distH', icon: 'distributeH', run: () => distributeSelection('x'), enabled: sel(3) },
  { id: 'arrange.distributeV', label: 'align.distV', icon: 'distributeV', run: () => distributeSelection('y'), enabled: sel(3) },
  { id: 'arrange.front', label: 'design.cmd.front', icon: 'front', keys: 'Shift+PageUp', run: () => orderSelection('front'), enabled: sel() },
  { id: 'arrange.back', label: 'design.cmd.back', icon: 'back', keys: 'Shift+PageDown', run: () => orderSelection('back'), enabled: sel() },
  { id: 'arrange.forward', label: 'design.cmd.forward', icon: 'up', keys: 'Ctrl+PageUp', run: () => orderSelection('forward'), enabled: sel(), advanced: true },
  { id: 'arrange.backward', label: 'design.cmd.backward', icon: 'down', keys: 'Ctrl+PageDown', run: () => orderSelection('backward'), enabled: sel(), advanced: true },

  { id: 'path.combine', label: 'design.cmd.combine', icon: 'combine', keys: 'Ctrl+L', run: combineSelection, enabled: sel(2) },
  { id: 'path.breakApart', label: 'design.cmd.breakApart', icon: 'breakApart', keys: 'Ctrl+K', run: breakApartSelection, enabled: multiPath },
  { id: 'path.reverse', label: 'design.cmd.reverse', icon: 'reverse', run: reverseSelection, enabled: hasPaths, advanced: true },

  { id: 'tools.palette', label: 'design.cmd.palette', icon: 'command', keys: 'Ctrl+Shift+P', run: dialog('palette') },
  { id: 'tools.shortcuts', label: 'design.cmd.shortcuts', icon: 'keyboard', run: dialog('shortcuts') },
  { id: 'tools.customize', label: 'design.cmd.customize', icon: 'sliders', run: dialog('customize') },
  { id: 'tools.advanced', label: 'design.cmd.advanced', icon: 'gear', run: () => { designStore.patch({ mode: designStore.get().mode === 'advanced' ? 'beginner' : 'advanced' }); saveDesignPrefs(); }, checked: () => designStore.get().mode === 'advanced' },

  { id: 'cnc.send', label: 'design.cmd.send', icon: 'send', keys: 'Ctrl+Enter', run: () => void sendToProduction() },
  { id: 'cnc.production', label: 'design.cmd.production', icon: 'nest', run: () => go('nest') },
  { id: 'cnc.nesting', label: 'nestm.open', icon: 'nest', run: () => openModal('nest') },
  { id: 'cnc.toolpath', label: 'toolpath.open', icon: 'path', run: () => openModal('toolpath'), enabled: hasLayout },
  { id: 'cnc.machine', label: 'nav.section.machine', icon: 'machine', run: () => openModal('machine') },
  { id: 'cnc.gcode', label: 'tool.gcode', icon: 'code', run: () => openModal('gcode'), enabled: hasLayout },
  { id: 'cnc.simulation', label: 'nav.section.editor', icon: 'editor', run: () => go('editor') },
  { id: 'cnc.export', label: 'nav.section.export', icon: 'download', run: () => openModal('export') },

  { id: 'window.toolbox', label: 'design.cmd.toolbox', icon: 'panelLeft', run: toggle('toolbox'), checked: on('toolbox') },
  { id: 'window.properties', label: 'design.cmd.properties', icon: 'panelRight', run: toggle('props'), checked: on('props') },
  { id: 'window.layers', label: 'design.cmd.layers', icon: 'layers', run: props('layers') },
  { id: 'window.home', label: 'nav.section.home', icon: 'home', run: () => go('home') },
  { id: 'window.projects', label: 'nav.section.projects', icon: 'history', run: () => go('projects') },
  { id: 'window.shop', label: 'nav.section.shop', icon: 'shop', run: () => go('shop') },

  { id: 'help.guide', label: 'nav.help', icon: 'help', keys: 'F1', run: () => uiStore.patch({ dialog: 'help' }) }
];

export const command = (id: string): Command | undefined => COMMANDS.find(c => c.id === id);
export const isEnabled = (c: Command): boolean => !c.enabled || c.enabled();

export interface Menu { id: string; label: Key; items: string[] }

/** The menu bar. Each entry is a command id or '|' for a separator. Effects arrives with offset and contour (Phase 5). */
export const MENUS: Menu[] = [
  { id: 'file', label: 'design.menu.file', items: ['file.new', 'file.open', 'file.save', 'file.saveAs', '|', 'file.importSvg', 'file.exportSvg', '|', 'file.preferences'] },
  { id: 'edit', label: 'design.menu.edit', items: ['edit.undo', 'edit.redo', '|', 'edit.cut', 'edit.copy', 'edit.paste', 'edit.duplicate', 'edit.delete', '|', 'edit.selectAll', 'edit.deselect'] },
  { id: 'view', label: 'design.menu.view', items: ['view.zoomIn', 'view.zoomOut', 'view.zoom100', 'view.fitPage', 'view.fitSelection', '|', 'view.grid', 'view.rulers', 'view.snap', '|', 'view.theme'] },
  { id: 'layout', label: 'design.menu.layout', items: ['layout.page', 'layout.pageFromSheet', '|', 'layout.newLayer'] },
  { id: 'object', label: 'design.menu.object', items: ['object.group', 'object.ungroup', '|', 'object.transform', 'object.rotateCw', 'object.rotateCcw', 'object.flipH', 'object.flipV', '|', 'object.lock', 'object.unlockAll', 'object.hide', 'object.showAll'] },
  { id: 'text', label: 'design.menu.text', items: ['text.khmer'] },
  { id: 'arrange', label: 'design.menu.arrange', items: ['arrange.alignLeft', 'arrange.alignCenter', 'arrange.alignRight', 'arrange.alignTop', 'arrange.alignMiddle', 'arrange.alignBottom', 'arrange.centerPage', '|', 'arrange.distributeH', 'arrange.distributeV', '|', 'arrange.front', 'arrange.back', 'arrange.forward', 'arrange.backward'] },
  { id: 'path', label: 'design.menu.path', items: ['path.combine', 'path.breakApart', 'path.reverse'] },
  { id: 'tools', label: 'design.menu.tools', items: ['tools.palette', 'tools.shortcuts', 'tools.customize', '|', 'tools.advanced'] },
  { id: 'cnc', label: 'design.menu.cnc', items: ['cnc.send', '|', 'cnc.production', 'cnc.nesting', 'cnc.toolpath', 'cnc.machine', 'cnc.gcode', 'cnc.simulation', 'cnc.export'] },
  { id: 'window', label: 'design.menu.window', items: ['window.toolbox', 'window.properties', 'window.layers', '|', 'window.home', 'window.projects', 'window.shop'] },
  { id: 'help', label: 'design.menu.help', items: ['help.guide', 'tools.shortcuts'] }
];

/** Normalised key name of an event, in the same form as `Command.keys`. */
export function keyName(e: KeyboardEvent): string {
  const ctrl = e.ctrlKey || e.metaKey, printable = e.key.length === 1;
  const parts: string[] = [];
  if (ctrl) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  // Shift on its own is how '+' and capitals are typed; it only counts with Ctrl or on named keys.
  if (e.shiftKey && (!printable || ctrl)) parts.push('Shift');
  const k = e.key === ' ' ? 'Space' : e.key === 'Escape' ? 'Esc' : e.key === '=' ? '+' : printable ? e.key.toUpperCase() : e.key;
  return [...parts, k].join('+');
}
