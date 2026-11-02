import { useT, type Key } from '../../app/i18n';
import { Icon, type IconName } from '../../components/icons';
import { useStore } from '../../stores/store';
import { uiStore } from '../../stores/ui-store';
import { command, isEnabled } from './commands';
import { designStore, type DesignState, type DesignTool } from './design-store';
import { useCommandStates, visibleItems } from './MenuBar';

export interface ToolDef { id: DesignTool; icon: IconName; label: Key; keys: string; advanced?: boolean }

/** The toolbox, by category. Only tools that work are listed; node editing and boolean shaping come in later phases. */
export const TOOL_GROUPS: { id: string; label: Key; tools: ToolDef[] }[] = [
  { id: 'select', label: 'design.tools.select', tools: [
    { id: 'pick', icon: 'pointer', label: 'design.tool.pick', keys: 'V' },
    { id: 'pan', icon: 'hand', label: 'design.tool.pan', keys: 'H' },
    { id: 'zoom', icon: 'zoom', label: 'design.tool.zoom', keys: 'Z' }
  ] },
  { id: 'shapes', label: 'design.tools.shapes', tools: [
    { id: 'rect', icon: 'square', label: 'design.tool.rect', keys: 'F6' },
    { id: 'ellipse', icon: 'circle', label: 'design.tool.ellipse', keys: 'F7' },
    { id: 'polygon', icon: 'hexagon', label: 'design.tool.polygon', keys: 'Y' },
    { id: 'star', icon: 'star', label: 'design.tool.star', keys: 'S' },
    { id: 'spiral', icon: 'spiral', label: 'design.tool.spiral', keys: 'A', advanced: true },
    { id: 'grid', icon: 'grid', label: 'design.tool.grid', keys: 'D', advanced: true }
  ] },
  { id: 'lines', label: 'design.tools.lines', tools: [
    { id: 'line', icon: 'line', label: 'design.tool.line', keys: 'N' },
    { id: 'polyline', icon: 'polyline', label: 'design.tool.polyline', keys: 'Q' },
    { id: 'freehand', icon: 'pencil', label: 'design.tool.freehand', keys: 'F5' }
  ] }
];
export const TOOL_DEFS = TOOL_GROUPS.flatMap(g => g.tools);

export function setTool(tool: DesignTool): void {
  designStore.patch({ tool, menu: null });
}

/** The main toolbar: the commands the operator chose, in their order. */
export function MainToolbar() {
  const { t } = useT();
  const ids = useStore(designStore, s => s.toolbar);
  const advanced = useStore(designStore, s => s.mode === 'advanced');
  useCommandStates(ids);
  return (
    <div className="main-toolbar" role="toolbar" aria-label={t('design.toolbar')} data-testid="design-toolbar" data-scroll-strip>
      {visibleItems(ids, advanced).map((c, k) => {
        if (c === '|') return <span key={`s${k}`} className="tb-sep" aria-hidden="true" />;
        const label = t(c.label), checked = c.checked?.();
        return (
          <button key={c.id} type="button" className={'tb-btn' + (checked ? ' on' : '')} disabled={!isEnabled(c)} aria-pressed={c.checked ? !!checked : undefined}
            title={c.keys ? `${label} (${c.keys})` : label} aria-label={label} onClick={c.run} data-testid={`tb-${c.id}`}>
            <Icon name={c.icon ?? 'more'} />
          </button>
        );
      })}
      <span className="tb-sep" aria-hidden="true" />
      <button type="button" className="tb-btn" title={t('design.cmd.customize')} aria-label={t('design.cmd.customize')}
        onClick={() => uiStore.patch({ dialog: { design: 'customize' } })} data-testid="tb-customize">
        <Icon name="sliders" />
      </button>
    </div>
  );
}

/** The drawing tools down the left side, grouped by what they make. */
export function Toolbox() {
  const { t } = useT();
  const tool = useStore(designStore, s => s.tool);
  const advanced = useStore(designStore, s => s.mode === 'advanced');
  useCommandStates(['text.khmer']);
  return (
    <div className="toolbox" role="toolbar" aria-orientation="vertical" aria-label={t('design.toolbox')} data-testid="design-toolbox">
      {TOOL_GROUPS.map(g => (
        <div key={g.id} className="toolbox-group" role="group" aria-label={t(g.label)}>
          {g.tools.filter(x => advanced || !x.advanced).map(x => {
            const label = t(x.label);
            return (
              <button key={x.id} type="button" className={'tool-btn' + (tool === x.id ? ' on' : '')} aria-pressed={tool === x.id}
                title={`${label} (${x.keys})`} aria-label={label} onClick={() => setTool(x.id)} data-testid={`tool-${x.id}`}>
                <Icon name={x.icon} />
              </button>
            );
          })}
        </div>
      ))}
      <div className="toolbox-group" role="group" aria-label={t('design.tools.text')}>
        <button type="button" className="tool-btn" title={`${t('design.cmd.khmerText')} — ${t('dock.opensWindow')} (F8)`} aria-label={t('design.cmd.khmerText')}
          aria-haspopup="dialog" onClick={() => command('text.khmer')!.run()} data-testid="tool-text">
          <Icon name="text" />
        </button>
      </div>
    </div>
  );
}

type Option = { key: keyof Pick<DesignState, 'sides' | 'points' | 'inner' | 'turns' | 'cols' | 'rows'>; label: Key; min: number; max: number; step: number; pct?: boolean };
const OPTIONS: Partial<Record<DesignTool, Option[]>> = {
  polygon: [{ key: 'sides', label: 'design.opt.sides', min: 3, max: 64, step: 1 }],
  star: [{ key: 'points', label: 'design.opt.points', min: 3, max: 64, step: 1 }, { key: 'inner', label: 'design.opt.inner', min: 5, max: 95, step: 5, pct: true }],
  spiral: [{ key: 'turns', label: 'design.opt.turns', min: 1, max: 30, step: 1 }],
  grid: [{ key: 'cols', label: 'design.opt.cols', min: 1, max: 50, step: 1 }, { key: 'rows', label: 'design.opt.rows', min: 1, max: 50, step: 1 }]
};
const HINTS: Partial<Record<DesignTool, Key>> = {
  pick: 'design.hint.pick', pan: 'design.hint.pan', zoom: 'design.hint.zoom', rect: 'design.hint.shape', ellipse: 'design.hint.shape', polygon: 'design.hint.shape',
  star: 'design.hint.shape', spiral: 'design.hint.shape', grid: 'design.hint.shape', line: 'design.hint.line', polyline: 'design.hint.polyline', freehand: 'design.hint.freehand'
};

/** The bar under the toolbar: what the current tool does and its settings. */
export function ToolOptions() {
  const { t } = useT();
  const tool = useStore(designStore, s => s.tool);
  const values = useStore(designStore, s => `${s.sides},${s.points},${s.inner},${s.turns},${s.cols},${s.rows}`);
  const nudge = useStore(designStore, s => s.nudge), gridMm = useStore(designStore, s => s.gridMm);
  const def = TOOL_DEFS.find(x => x.id === tool);
  void values;
  const s = designStore.get();
  const num = (v: string, lo: number, hi: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null; };
  return (
    <div className="tool-options" data-testid="tool-options" data-scroll-strip>
      {def && <strong className="tool-name"><Icon name={def.icon} size={16} />{t(def.label)}</strong>}
      {(OPTIONS[tool] ?? []).map(o => (
        <label key={o.key} className="opt">
          <span>{t(o.label)}</span>
          <input type="number" min={o.min} max={o.max} step={o.step} value={o.pct ? Math.round(s[o.key] * 100) : s[o.key]} data-testid={`opt-${o.key}`}
            onChange={e => { const n = num(e.target.value, o.min, o.max); if (n !== null) designStore.patch({ [o.key]: o.pct ? n / 100 : Math.round(n) }); }} />
        </label>
      ))}
      {HINTS[tool] && <span className="tool-hint">{t(HINTS[tool]!)}</span>}
      <span className="opt-spacer" />
      <label className="opt">
        <span>{t('design.opt.grid')}</span>
        <input type="number" min={1} max={100} step={1} value={gridMm} data-testid="opt-grid"
          onChange={e => { const n = num(e.target.value, 1, 100); if (n !== null) { designStore.patch({ gridMm: n }); } }} />
      </label>
      <label className="opt">
        <span>{t('design.opt.nudge')}</span>
        <input type="number" min={0} max={1000} step={1} value={nudge} data-testid="opt-nudge"
          onChange={e => { const n = num(e.target.value, 0, 1000); if (n !== null) designStore.patch({ nudge: n }); }} />
      </label>
    </div>
  );
}
