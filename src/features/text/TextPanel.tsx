import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useT, type Key } from '../../app/i18n';
import { Icon } from '../../components/icons';
import { NumberField, SelectField, Stat } from '../../components/ui';
import { useStore } from '../../stores/store';
import {
  acceptOutlines, addFontFile, addToProject, confirmPreview, convertText, downloadTextSvg, editText, inputKey, MAX_CHARS, MAX_HEIGHT, measureRatio,
  MIN_HEIGHT, restartText, scanFonts, textProblems, textStore
} from './text-store';

type StepState = 'done' | 'current' | 'waiting';

function Step({ n, state, open, onToggle, needs, children, summary }: {
  n: number; state: StepState; open: boolean; onToggle: () => void; needs?: string; children: ReactNode; summary?: string;
}) {
  const { t } = useT();
  const body = useId();
  return (
    <li className={`step ${state}${open ? ' open' : ''}`} data-testid={`text-step-${n}`} data-state={state}>
      <button type="button" className="step-head" aria-expanded={open} aria-controls={body} disabled={state === 'waiting'} onClick={onToggle}>
        <span className="step-num" aria-hidden="true">{state === 'done' ? <Icon name="check" size={14} /> : n}</span>
        <span className="step-title">
          <b>{t(`text.step.${n}` as Key)}</b>
          <small>{state === 'waiting' && needs ? t('text.needs', { what: needs }) : state === 'done' && summary ? summary : t(`text.status.${state}`)}</small>
        </span>
        {state !== 'waiting' && <Icon name={open ? 'up' : 'down'} size={16} />}
      </button>
      {open && <div className="step-body" id={body}>{children}</div>}
    </li>
  );
}

export function TextPanel() {
  const { t } = useT();
  const s = useStore(textStore, x => x);
  const fontInput = useRef<HTMLInputElement>(null);
  useEffect(scanFonts, []);
  useEffect(() => { void measureRatio(); }, [s.fontId, s.refGlyph, s.fonts]);
  const key = inputKey(s), problems = textProblems(s);
  const ok1 = !problems.text, ok2 = ok1 && !problems.settings;
  const ok3 = ok2 && s.previewKey === key, ok4 = ok3 && s.result?.key === key, ok5 = ok4 && s.acceptedKey === key;
  const done = [ok1, ok2, ok3, ok4, ok5, s.addedKey === key && ok5];
  const current = done.findIndex(d => !d);
  // Each step needs the one before it, so everything before the first open step is done.
  const stateOf = (i: number): StepState => (current < 0 || i < current ? 'done' : i === current ? 'current' : 'waiting');
  const [open, setOpen] = useState<number>(current < 0 ? 5 : current);
  // Typing must not fold the text box away, so the input steps move on only with their Continue buttons.
  useEffect(() => { if (current < 0 || current > 2) setOpen(current < 0 ? 5 : current); }, [current]);
  const toggle = (i: number) => setOpen(o => (o === i ? -1 : i));
  const needs = (i: number) => t(`text.step.${i}` as Key);
  const font = s.fonts.find(f => f.id === s.fontId);
  const res = s.result?.render.pxPerMm ? (1 / s.result.render.pxPerMm).toFixed(2) : '0.25';
  const summary = s.result?.key === key ? s.result.summary : null;
  const blocking = summary?.checks.some(c => c.severity === 'error');
  const hasKhmer = /[ក-៿᧠-᧿]/.test(s.text);
  const groups = (['bundled', 'system', 'file'] as const).map(src => ({ src, list: s.fonts.filter(f => f.source === src) })).filter(g => g.list.length);

  return (
    <div className="text-flow">
      <ol className="steps" aria-label={t('text.steps')}>
        <Step n={1} state={stateOf(0)} open={open === 0} onToggle={() => toggle(0)} summary={s.text.trim().split(/\s+/).join(' ').slice(0, 40)}>
          <div className="field">
            <label htmlFor="khmer-text">{t('text.input')}</label>
            <textarea id="khmer-text" className="khmer-input" rows={3} value={s.text} maxLength={MAX_CHARS + 50} lang="km" spellCheck={false}
              aria-invalid={problems.text === 'long'} aria-describedby="khmer-text-hint" onChange={e => editText({ text: e.target.value })} data-testid="text-input" />
            <span className="field-foot">
              <small id="khmer-text-hint" className="hint">{t('text.inputHint')}</small>
              <small className={s.text.length > MAX_CHARS ? 'field-error' : 'hint'}>{t('text.chars', { n: s.text.length, max: MAX_CHARS })}</small>
            </span>
          </div>
          {problems.text === 'long' && <p className="notice bad">{t('text.tooLong', { max: MAX_CHARS })}</p>}
          {s.text.trim() && !hasKhmer && <p className="notice warn">{t('text.noKhmer')}</p>}
          <button type="button" className="btn primary block" onClick={() => setOpen(1)} disabled={!ok1} data-testid="text-next-1">{t('text.next')}<Icon name="arrowRight" size={16} /></button>
        </Step>

        <Step n={2} state={stateOf(1)} open={open === 1} onToggle={() => toggle(1)} needs={needs(1)} summary={font ? `${font.label} · ${s.refGlyph} = ${s.refHeight} mm` : undefined}>
          <div className="field">
            <label htmlFor="text-font">{t('text.font')}</label>
            <select id="text-font" value={s.fontId} onChange={e => editText({ fontId: e.target.value })} data-testid="text-font">
              {groups.map(g => (
                <optgroup key={g.src} label={t(`text.font.${g.src}` as Key)}>
                  {g.list.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="font-sample" style={font ? { fontFamily: `"${font.family}"`, fontWeight: font.weight } : undefined} lang="km" aria-hidden="true">
            {(s.text.trim() || 'កខគ សួស្តី').slice(0, 24)}
          </div>
          <div>
            <button type="button" className="btn" onClick={() => fontInput.current?.click()} data-testid="text-font-upload"><Icon name="font" size={16} />{t('text.font.upload')}</button>
            <input ref={fontInput} type="file" accept=".ttf,.otf,.woff,.woff2" hidden data-testid="font-input"
              onChange={e => { const f = e.target.files?.[0]; if (f) void addFontFile(f); e.target.value = ''; }} />
            <p className="hint">{t('text.font.uploadHint')}</p>
          </div>
          <div className="fields">
            <div className="field">
              <label htmlFor="ref-glyph">{t('text.refGlyph')}</label>
              <input id="ref-glyph" type="text" className="glyph-input" value={s.refGlyph} maxLength={4} lang="km" aria-invalid={problems.settings === 'glyph'}
                onChange={e => editText({ refGlyph: e.target.value })} data-testid="ref-glyph" />
            </div>
            <NumberField label={t('text.refHeight')} value={s.refHeight} min={MIN_HEIGHT} max={MAX_HEIGHT} step={1} testId="ref-height"
              onChange={v => { if (v !== null) editText({ refHeight: v }); }} />
            <SelectField label={t('text.align')} value={s.align} wide={false} onChange={align => editText({ align })} testId="text-align"
              options={[{ value: 'left', label: t('text.align.left') }, { value: 'center', label: t('text.align.center') }, { value: 'right', label: t('text.align.right') }]} />
            <NumberField label={t('text.lineGap')} value={s.lineGap} min={0} max={1000} step={1} onChange={v => { if (v !== null) editText({ lineGap: v }); }} testId="line-gap" />
          </div>
          <p className="ref-explain" data-testid="ref-explain"><Icon name="ruler" size={16} /><span>{t('text.refHint', { glyph: s.refGlyph.trim() || 'ក', h: s.refHeight })}</span></p>
          {problems.settings === 'height' && <p className="notice bad">{t('text.heightRange', { min: MIN_HEIGHT, max: MAX_HEIGHT })}</p>}
          {problems.settings === 'glyph' && <p className="notice bad">{t('text.glyphRange')}</p>}
          {s.error && s.error.startsWith('font') && <p className="notice bad" role="alert">{t(`text.err.${s.error}` as Key)}</p>}
          {s.error === 'ref-blank' && <p className="notice bad" role="alert">{t('text.err.ref-blank')}</p>}
          <button type="button" className="btn primary block" onClick={() => setOpen(2)} disabled={!ok2} data-testid="text-next-2">{t('text.next')}<Icon name="arrowRight" size={16} /></button>
        </Step>

        <Step n={3} state={stateOf(2)} open={open === 2} onToggle={() => toggle(2)} needs={needs(2)}>
          <p className="hint">{t('text.preview.hint')}</p>
          {s.previewKey && s.previewKey !== key && <p className="notice warn">{t('text.preview.changed')}</p>}
          <button type="button" className="btn primary block" onClick={confirmPreview} disabled={!ok2} data-testid="text-preview-ok"><Icon name="check" size={16} />{t('text.preview.ok')}</button>
        </Step>

        <Step n={4} state={stateOf(3)} open={open === 3} onToggle={() => toggle(3)} needs={needs(3)} summary={s.result ? t('text.converted', { n: s.result.render.rings.length, res }) : undefined}>
          <p className="hint">{t('text.convert.hint', { res })}</p>
          {s.busy ? (
            <div className="running" role="status">
              <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(s.busy.done / Math.max(1, s.busy.total) * 100)}>
                <i style={{ width: `${s.busy.stage === 'build' ? 95 : Math.max(8, Math.round(s.busy.done / Math.max(1, s.busy.total) * 90))}%` }} />
              </div>
              <p className="progress-note">{s.busy.stage === 'build' ? t('text.building') : t('text.converting', { n: Math.min(s.busy.done + 1, s.busy.total), total: s.busy.total })}</p>
            </div>
          ) : (
            <button type="button" className="btn primary block" onClick={() => void convertText()} disabled={!ok3} data-testid="text-convert"><Icon name="path" size={16} />{t('text.convert')}</button>
          )}
          {s.error && !s.error.startsWith('font') && s.error !== 'ref-blank' && <p className="notice bad" role="alert" data-testid="text-error">{t(`text.err.${s.error}` as Key)}</p>}
          {ok4 && s.result && <p className="notice ok" data-testid="text-converted">{t('text.converted', { n: s.result.render.rings.length, res })}</p>}
          {ok4 && s.result && s.result.render.pxPerMm < 4 && <p className="notice warn">{t('text.reduced', { res })}</p>}
        </Step>

        <Step n={5} state={stateOf(4)} open={open === 4} onToggle={() => toggle(4)} needs={needs(4)}>
          <p className="hint">{t('text.validate.hint')}</p>
          {summary && s.result && (
            <>
              <dl className="stats" data-testid="text-stats">
                <Stat label={t('text.stat.pieces')} value={summary.pieces} testId="text-pieces" />
                <Stat label={t('text.stat.holes')} value={summary.holes} />
                <Stat label={t('text.stat.contours')} value={summary.contours} />
                <Stat label={t('text.stat.points')} value={summary.points.toLocaleString()} />
                <Stat label={t('text.stat.size')} value={`${summary.width.toFixed(1)} × ${summary.height.toFixed(1)} mm`} testId="text-size" />
                <Stat label={t('text.stat.ref', { glyph: s.refGlyph.trim() })} value={`${s.result.render.refMeasured.toFixed(1)} mm`} testId="text-ref" />
                <Stat label={t('text.stat.smallest')} value={`${summary.smallest.toFixed(1)} mm`} />
              </dl>
              <ul className="notices" data-testid="text-checks">
                {summary.checks.length ? summary.checks.map(c => (
                  <li key={c.code} className={'notice ' + (c.severity === 'error' ? 'bad' : c.severity === 'warning' ? 'warn' : 'info')}>
                    {t(`text.check.${c.code}` as Key, { n: c.count, detail: c.detail ?? '' })}
                  </li>
                )) : <li className="notice ok">{t('text.check.ok')}</li>}
              </ul>
              <button type="button" className="btn primary block" onClick={acceptOutlines} disabled={!ok4 || blocking} data-testid="text-accept"><Icon name="ok" size={16} />{t('text.accept')}</button>
            </>
          )}
        </Step>

        <Step n={6} state={stateOf(5)} open={open === 5} onToggle={() => toggle(5)} needs={needs(5)}>
          <button type="button" className="btn primary block" onClick={addToProject} disabled={!ok5 || s.addedKey === key} data-testid="text-add"><Icon name="send" size={16} />{t('text.add')}</button>
          <button type="button" className="btn block" onClick={downloadTextSvg} disabled={!ok5} data-testid="text-svg"><Icon name="download" size={16} />{t('text.svg')}</button>
          <p className="hint">{t('text.export.hint')}</p>
          {s.addedKey === key && <button type="button" className="link" onClick={restartText}>{t('text.restart')}</button>}
        </Step>
      </ol>
    </div>
  );
}
