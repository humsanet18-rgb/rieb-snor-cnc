import { useEffect, useMemo, useRef, useState } from 'react';
import { tapOf } from '../../app/actions';
import { formatDuration, useT } from '../../app/i18n';
import { Check, IconButton, PanelCard } from '../../components/ui';
import { TAP_FIRST_MOVE } from '../../engines/gcode-engine/tap';
import { activeLayout, activeProfile, projectStore } from '../../stores/project-store';
import { useStore } from '../../stores/store';
import { uiStore } from '../../stores/ui-store';
import { CutFields } from '../cutting-path/CutFields';
import { sheetItems } from '../nesting/model';
import { setSettings } from '../nesting/SheetPanel';
import { cumulativeLengths, pointAlong } from '../preview/view';
import { nodeAt, pieceVisits } from './motion';

const ROW = 22;

/** Draws only the lines in view, because a sheet can have tens of thousands of them. */
export function GCodeList({ lines, current, pick, tall, testId = 'gcode' }: { lines: string[]; current: number; pick: (line: number) => void; tall?: boolean; testId?: string }) {
  const { t } = useT();
  const box = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const y = current * ROW;
    if (y < el.scrollTop || y + ROW > el.scrollTop + el.clientHeight) el.scrollTop = Math.max(0, y - el.clientHeight / 2);
  }, [current]);
  const first = Math.max(0, Math.floor(top / ROW) - 4), shown = lines.slice(first, first + (tall ? 80 : 32));
  return (
    <div className={'gcode' + (tall ? ' tall' : '')} ref={box} role="group" data-testid={testId} aria-label={t('editor.gcode')} onScroll={e => setTop(e.currentTarget.scrollTop)}>
      <div style={{ height: lines.length * ROW }}>
        {shown.map((text, k) => {
          const line = first + k;
          return (
            <button type="button" key={line} className={'gline' + (line === current ? ' on' : '')} style={{ top: line * ROW, height: ROW }}
              aria-current={line === current ? 'true' : undefined} data-testid={line === current ? `${testId}-current` : undefined} onClick={() => pick(line)}>
              <i>{line + 1}</i>{text}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const go = (position: number) => uiStore.patch({ playback: { ...uiStore.get().playback, position, playing: false } });

export function EditorPanel() {
  const { t, lang } = useT();
  const project = useStore(projectStore, s => s.project);
  const profile = useStore(projectStore, activeProfile);
  const sheetIndex = useStore(uiStore, s => s.sheet);
  const paths = useStore(uiStore, s => s.toolpaths);
  const busy = useStore(uiStore, s => s.toolpathBusy);
  const position = useStore(uiStore, s => s.playback.position);
  const follow = useStore(uiStore, s => s.follow);
  const layout = activeLayout(project);
  const index = layout ? Math.min(sheetIndex, Math.max(0, layout.sheets.length - 1)) : 0;
  const sheet = layout?.sheets[index], toolpath = paths?.sheets[index], path = toolpath?.stroke.path;
  const cumulative = useMemo(() => (path ? cumulativeLengths(path) : []), [path]);
  const motion = useMemo(() => (path && sheet ? pieceVisits(path, sheetItems(sheet, project.designs)) : null), [path, sheet, project.designs]);
  const lines = useMemo(() => (path ? tapOf(index)?.text.split('\r\n') ?? [] : []), [path, index, profile]);
  const manualAllowed = layout?.mode !== 'keep';
  const fields = (
    <PanelCard title={t('editor.options')} icon="path">
      <CutFields />
      {manualAllowed && (
        <Check label={t('editor.manual')} checked={project.settings.mode === 'manual'} testId="editor-manual"
          onChange={v => setSettings(x => ({ ...x, mode: v ? 'manual' : 'auto' }))} />
      )}
      {project.settings.mode === 'manual' && <p className="hint">{t('editor.manualHint')}</p>}
    </PanelCard>
  );
  if (!path || !toolpath || !motion) {
    return (
      <div className="editor-panel" data-testid="editor">
        <p className={busy ? 'progress-note' : 'empty-note'} data-testid="editor-empty">{busy ? t('path.busy') : t('editor.empty')}</p>
        {fields}
      </div>
    );
  }
  const total = cumulative[cumulative.length - 1] ?? 0, at = Math.min(position, total), node = nodeAt(cumulative, at);
  const [x, y] = pointAlong(path, cumulative, at);
  const piece = motion.pieceAt[node], reached = motion.visits.filter(v => v.node <= node).length;
  const next = motion.visits.find(v => v.node > node), previous = [...motion.visits].reverse().find(v => v.node < node);
  const pick = (line: number) => {
    const n = line - TAP_FIRST_MOVE;
    if (n >= 0 && n < path.length) go(cumulative[n]);
  };
  return (
    <div className="editor-panel" data-testid="editor">
      <PanelCard title={t('card.playback')} icon="editor">
        <dl className="motion" data-testid="motion">
          <div><dt>X</dt><dd data-testid="motion-x">{x.toFixed(2)}</dd></div>
          <div><dt>Y</dt><dd data-testid="motion-y">{y.toFixed(2)}</dd></div>
          <div><dt>{t('editor.done')}</dt><dd>{(at / 1000).toFixed(2)} {t('unit.m')}</dd></div>
          <div><dt>{t('editor.left')}</dt><dd>{((total - at) / 1000).toFixed(2)} {t('unit.m')}</dd></div>
          <div><dt>{t('editor.timeLeft')}</dt><dd>{profile.feed > 0 ? formatDuration(lang, (total - at) / profile.feed) : '—'}</dd></div>
          <div><dt>{t('editor.piece')}</dt><dd data-testid="motion-piece">{piece >= 0 ? `${reached} / ${motion.visits.length}` : '—'}</dd></div>
          <div><dt>{t('editor.move')}</dt><dd>{node + 1} / {path.length}</dd></div>
          <div><dt>{t('editor.retrace')}</dt><dd>{(toolpath.retrace / 1000).toFixed(2)} {t('unit.m')}</dd></div>
        </dl>
        <div className="editor-steps">
          <button type="button" className="btn" disabled={!previous} onClick={() => previous && go(cumulative[previous.node])} data-testid="prev-piece">{t('editor.prevPiece')}</button>
          <IconButton icon="left" label={t('editor.prevMove')} disabled={node <= 0 && at <= 0} testId="prev-move" onClick={() => go(at > cumulative[node] ? cumulative[node] : cumulative[Math.max(0, node - 1)])} />
          <IconButton icon="right" label={t('editor.nextMove')} disabled={at >= total} testId="next-move" onClick={() => go(cumulative[Math.min(path.length - 1, node + 1)])} />
          <button type="button" className="btn" disabled={!next} onClick={() => next && go(cumulative[next.node])} data-testid="next-piece">{t('editor.nextPiece')}</button>
        </div>
        <Check label={t('editor.follow')} checked={follow} testId="follow" onChange={v => uiStore.patch({ follow: v })} />
      </PanelCard>
      <PanelCard title={t('card.gcode')} icon="file">
        <GCodeList lines={lines} current={TAP_FIRST_MOVE + node} pick={pick} />
        <p className="hint">{t('editor.gcodeHint')}</p>
      </PanelCard>
      {fields}
    </div>
  );
}
