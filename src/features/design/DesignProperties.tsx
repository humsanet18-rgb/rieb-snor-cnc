import { useEffect, useId, useState } from 'react';
import { useT, type Key } from '../../app/i18n';
import { Icon } from '../../components/icons';
import { ModalTabs } from '../../components/modal';
import { Check, NumberField } from '../../components/ui';
import { editable, findTop, rotationOf, selectionBBox, walk } from '../../engines/vector-engine/document';
import { nodeCount } from '../../engines/vector-engine/path';
import type { VItem, VStyle } from '../../engines/vector-engine/types';
import { projectStore } from '../../stores/project-store';
import { useStore } from '../../stores/store';
import {
  activateLayer, deleteLayer, docOf, newLayer, pageFromSheet, renameItem, rotateSelection, selectionToLayer, setLayer, setPage, setSelectionBox,
  skewSelection, styleSelection
} from './actions';
import { command } from './commands';
import { designStore, saveDesignPrefs, type PropsTab } from './design-store';

const r2 = (n: number) => Math.round(n * 100) / 100;

/** A text box that changes the document once, when the operator leaves it or presses Enter. */
function NameField({ label, value, onCommit, testId }: { label: string; value: string; onCommit: (v: string) => void; testId?: string }) {
  const id = useId();
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = () => { const v = text.trim(); if (v && v !== value) onCommit(v.slice(0, 120)); else setText(value); };
  return (
    <div className="field wide">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="text" value={text} maxLength={120} data-testid={testId}
        onChange={e => setText(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setText(value); }} />
    </div>
  );
}

function Run({ id, testId }: { id: string; testId?: string }) {
  const { t } = useT();
  const c = command(id)!;
  return (
    <button type="button" className="btn" disabled={c.enabled ? !c.enabled() : false} onClick={c.run} data-testid={testId ?? `prop-${id}`}>
      {c.icon && <Icon name={c.icon} size={16} />}{t(c.label)}
    </button>
  );
}

function stats(items: VItem[]) {
  let paths = 0, nodes = 0, open = 0, closed = 0;
  for (const { item: i } of walk(items)) {
    if (i.type !== 'path') continue;
    paths++;
    nodes += nodeCount(i.subpaths);
    for (const s of i.subpaths) if (s.closed) closed++; else open++;
  }
  return { paths, nodes, open, closed };
}

function ObjectTab() {
  const { t } = useT();
  const doc = useStore(projectStore, s => docOf(s.project));
  const raw = useStore(designStore, s => s.selected);
  const [ratio, setRatio] = useState(true);
  const [angle, setAngle] = useState(15);
  const ids = editable(doc, raw), items = ids.map(id => findTop(doc, id)?.item).filter((i): i is VItem => !!i);
  const box = selectionBBox(doc, ids);
  if (!items.length || !box) {
    const all = doc.layers.flatMap(l => l.items);
    return (
      <div className="props-empty" data-testid="design-props-empty">
        <p>{t('design.props.none')}</p>
        <p className="muted">{t('design.props.count', { n: all.length })}</p>
      </div>
    );
  }
  const one = items.length === 1 ? items[0] : null, st = stats(items);
  return (
    <div className="props-body">
      {one ? <NameField label={t('design.props.name')} value={one.name} onCommit={v => renameItem(one.id, v)} testId="design-prop-name" />
        : <p className="props-multi"><strong>{t('design.props.many', { n: items.length })}</strong></p>}
      <p className="muted props-kind" data-testid="design-prop-kind">
        {one ? t(one.type === 'group' ? 'design.kind.group' : (`design.shape.${one.kind}` as Key)) : ''}
        {' · '}{t('design.props.nodes', { n: st.nodes })}{' · '}{t('design.props.contours', { n: st.closed + st.open })}
      </p>
      <div className="field-grid">
        <NumberField label={t('design.props.x')} value={r2(box.x0)} step={1} onChange={v => v !== null && setSelectionBox({ x: v }, ratio)} testId="design-prop-x" />
        <NumberField label={t('design.props.y')} value={r2(box.y0)} step={1} onChange={v => v !== null && setSelectionBox({ y: v }, ratio)} testId="design-prop-y" />
        <NumberField label={t('design.props.w')} value={r2(box.x1 - box.x0)} min={0.01} step={1} onChange={v => v !== null && setSelectionBox({ w: v }, ratio)} testId="design-prop-w" />
        <NumberField label={t('design.props.h')} value={r2(box.y1 - box.y0)} min={0.01} step={1} onChange={v => v !== null && setSelectionBox({ h: v }, ratio)} testId="design-prop-h" />
      </div>
      <Check label={t('design.props.ratio')} checked={ratio} onChange={setRatio} testId="design-prop-ratio" />
      {one && <p className="muted" data-testid="design-prop-angle">{t('design.props.angle', { n: r2(rotationOf(one)) })}</p>}
      <div className="field-grid">
        <NumberField label={t('design.props.rotateBy')} value={angle} min={-360} max={360} step={1} onChange={v => v !== null && setAngle(v)} testId="design-prop-rotate" />
        <div className="field btn-field">
          <button type="button" className="btn" onClick={() => rotateSelection(angle)} data-testid="design-rotate-apply"><Icon name="rotate" size={16} />{t('design.props.rotate')}</button>
        </div>
      </div>
      <div className="btn-row">
        <Run id="object.rotateCcw" /><Run id="object.rotateCw" /><Run id="object.flipH" /><Run id="object.flipV" />
      </div>
      <SkewFields />
      {st.open > 0 && <p className="notice warn" data-testid="design-open-note"><Icon name="warn" size={16} />{t('design.props.openNote', { n: st.open })}</p>}
      <div className="btn-row">
        <Run id="cnc.send" testId="design-prop-send" />
      </div>
    </div>
  );
}

function SkewFields() {
  const { t } = useT();
  const advanced = useStore(designStore, s => s.mode === 'advanced');
  const [ax, setAx] = useState(0), [ay, setAy] = useState(0);
  if (!advanced) return null;
  return (
    <div className="field-grid">
      <NumberField label={t('design.props.skewX')} value={ax} min={-80} max={80} onChange={v => v !== null && setAx(v)} testId="design-prop-skewx" />
      <NumberField label={t('design.props.skewY')} value={ay} min={-80} max={80} onChange={v => v !== null && setAy(v)} testId="design-prop-skewy" />
      <div className="field btn-field wide">
        <button type="button" className="btn" disabled={!ax && !ay} onClick={() => skewSelection(ax, ay)} data-testid="design-skew-apply">{t('design.props.skew')}</button>
      </div>
    </div>
  );
}

const FILL_DEFAULT = '#5b8bd9', STROKE_DEFAULT = '#1d3f7a';

function ColorRow({ label, value, fallback, onChange, testId }: { label: string; value: string | null | undefined; fallback: string; onChange: (v: string | null) => void; testId: string }) {
  const { t } = useT();
  const id = useId();
  const mixed = value === undefined;
  return (
    <div className="color-row">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="color" value={value ?? fallback} disabled={value === null} onChange={e => onChange(e.target.value)} data-testid={`${testId}-color`} />
      <Check label={t('design.style.none')} checked={value === null} onChange={none => onChange(none ? null : fallback)} testId={`${testId}-none`} />
      {mixed && <span className="muted">{t('design.style.mixed')}</span>}
    </div>
  );
}

function StyleTab() {
  const { t } = useT();
  const doc = useStore(projectStore, s => docOf(s.project));
  const raw = useStore(designStore, s => s.selected);
  const items = editable(doc, raw).map(id => findTop(doc, id)?.item).filter((i): i is VItem => !!i);
  const paths: VStyle[] = [];
  for (const { item: i } of walk(items)) if (i.type === 'path') paths.push(i.style);
  if (!paths.length) return <div className="props-empty"><p>{t('design.props.none')}</p></div>;
  const same = <K extends keyof VStyle>(k: K): VStyle[K] | undefined => (paths.every(p => p[k] === paths[0][k]) ? paths[0][k] : undefined);
  const width = same('strokeWidth');
  return (
    <div className="props-body">
      <ColorRow label={t('design.style.fill')} value={same('fill')} fallback={FILL_DEFAULT} onChange={fill => styleSelection({ fill })} testId="design-fill" />
      <ColorRow label={t('design.style.stroke')} value={same('stroke')} fallback={STROKE_DEFAULT} onChange={stroke => styleSelection({ stroke })} testId="design-stroke" />
      <NumberField label={t('design.style.width')} value={width ?? null} optional min={0} max={50} step={0.1} onChange={v => v !== null && styleSelection({ strokeWidth: v })} testId="design-stroke-width" />
      <p className="muted">{t('design.style.note')}</p>
    </div>
  );
}

function LayersTab() {
  const { t } = useT();
  const doc = useStore(projectStore, s => docOf(s.project));
  const hasSel = useStore(designStore, s => s.selected.length > 0);
  const layers = [...doc.layers].reverse();
  return (
    <div className="props-body">
      <div className="btn-row">
        <button type="button" className="btn" onClick={newLayer} data-testid="design-layer-add"><Icon name="plus" size={16} />{t('design.cmd.newLayer')}</button>
      </div>
      <ul className="layer-list" data-testid="design-layers">
        {layers.map(l => {
          const active = l.id === doc.activeLayerId;
          return (
            <li key={l.id} className={active ? 'on' : ''} data-testid={`design-layer-${l.name}`}>
              <button type="button" className="icon-btn" aria-pressed={l.visible} title={t(l.visible ? 'design.layer.hide' : 'design.layer.show')} aria-label={t(l.visible ? 'design.layer.hide' : 'design.layer.show')}
                onClick={() => setLayer(l.id, { visible: !l.visible })} data-testid="layer-visible"><Icon name={l.visible ? 'eye' : 'eyeOff'} size={16} /></button>
              <button type="button" className="icon-btn" aria-pressed={l.locked} title={t(l.locked ? 'design.layer.unlock' : 'design.layer.lock')} aria-label={t(l.locked ? 'design.layer.unlock' : 'design.layer.lock')}
                onClick={() => setLayer(l.id, { locked: !l.locked })} data-testid="layer-lock"><Icon name={l.locked ? 'lock' : 'unlock'} size={16} /></button>
              <button type="button" className="layer-name" aria-current={active ? 'true' : undefined} onClick={() => activateLayer(l.id)} title={t('design.layer.activate')}>
                {l.name} <span className="muted">({l.items.length})</span>
              </button>
              {hasSel && !active && <button type="button" className="icon-btn" title={t('design.layer.moveHere')} aria-label={t('design.layer.moveHere')}
                onClick={() => selectionToLayer(l.id)} data-testid="layer-move"><Icon name="arrowRight" size={16} /></button>}
              {doc.layers.length > 1 && <button type="button" className="icon-btn" title={t('design.layer.delete')} aria-label={t('design.layer.delete')}
                onClick={() => deleteLayer(l.id)} data-testid="layer-delete"><Icon name="trash" size={16} /></button>}
            </li>
          );
        })}
      </ul>
      <NameField label={t('design.layer.rename')} value={doc.layers.find(l => l.id === doc.activeLayerId)?.name ?? ''} onCommit={v => setLayer(doc.activeLayerId, { name: v })} testId="design-layer-name" />
      <p className="muted">{t('design.layer.note')}</p>
    </div>
  );
}

function PageTab() {
  const { t } = useT();
  const page = useStore(projectStore, s => docOf(s.project).page);
  const sheetW = useStore(projectStore, s => s.project.settings.sheetW), sheetH = useStore(projectStore, s => s.project.settings.sheetH);
  const mode = useStore(designStore, s => s.mode);
  return (
    <div className="props-body">
      <div className="field-grid">
        <NumberField label={t('design.page.w')} value={page.w} min={1} max={100000} onChange={v => v !== null && setPage(v, page.h)} testId="design-page-w" />
        <NumberField label={t('design.page.h')} value={page.h} min={1} max={100000} onChange={v => v !== null && setPage(page.w, v)} testId="design-page-h" />
      </div>
      <div className="btn-row">
        <button type="button" className="btn" disabled={page.w === sheetW && page.h === sheetH} onClick={pageFromSheet} data-testid="design-page-sheet">
          <Icon name="ruler" size={16} />{t('design.page.fromSheet', { w: sheetW, h: sheetH })}
        </button>
      </div>
      <p className="muted">{t('design.page.note')}</p>
      <fieldset className="mode-field">
        <legend>{t('design.mode')}</legend>
        {(['beginner', 'advanced'] as const).map(m => (
          <label key={m} className="check">
            <input type="radio" name="design-mode" checked={mode === m} onChange={() => { designStore.patch({ mode: m }); saveDesignPrefs(); }} data-testid={`design-mode-${m}`} />
            <span>{t(`design.mode.${m}`)}</span>
          </label>
        ))}
      </fieldset>
    </div>
  );
}

const TABS: { id: PropsTab; icon: 'sliders' | 'edit' | 'layers' | 'file'; label: Key }[] = [
  { id: 'object', icon: 'sliders', label: 'design.tab.object' },
  { id: 'style', icon: 'edit', label: 'design.tab.style' },
  { id: 'layers', icon: 'layers', label: 'design.tab.layers' },
  { id: 'page', icon: 'file', label: 'design.tab.page' }
];

/** Properties of what is selected, the layers, and the page. */
export function DesignProperties() {
  const { t } = useT();
  const tab = useStore(designStore, s => s.propsTab);
  return (
    <aside className="design-props" aria-label={t('design.cmd.properties')} data-testid="design-props">
      <ModalTabs tabs={TABS.map(x => ({ id: x.id, icon: x.icon, label: t(x.label) }))} active={tab} onChange={propsTab => designStore.patch({ propsTab })} label={t('design.cmd.properties')} />
      <div role="tabpanel" aria-label={t(TABS.find(x => x.id === tab)!.label)} className="design-props-panel">
        {tab === 'object' ? <ObjectTab /> : tab === 'style' ? <StyleTab /> : tab === 'layers' ? <LayersTab /> : <PageTab />}
      </div>
    </aside>
  );
}
