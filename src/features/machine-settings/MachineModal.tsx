import { useState } from 'react';
import { applySession, useEditSession } from '../../app/edit-session';
import { tr, useT, type Key } from '../../app/i18n';
import { Icon } from '../../components/icons';
import { ApplyBar, Modal, ModalTabs, type Problem } from '../../components/modal';
import { Check, NumberField, SelectField, TextField } from '../../components/ui';
import { ask } from '../../stores/confirm-store';
import { activeLayout, activeProfile, commit, projectStore, setProfiles } from '../../stores/project-store';
import { useStore } from '../../stores/store';
import { closeModal } from '../../stores/ui-store';
import type { MachineProfile } from '../../types/project';
import { newId } from '../nesting/model';
import { SheetPreview } from '../preview/SheetPreview';
import { correctedSteps, editProfile, fieldState, readiness, type FieldState } from './calibration';

type Step = 'profile' | 'wire' | 'limits' | 'zero' | 'axes' | 'verify';
const STEPS: Step[] = ['profile', 'wire', 'limits', 'zero', 'axes', 'verify'];

function StateTag({ state }: { state: FieldState }) {
  const { t } = useT();
  return <span className={'tag ' + (state === 'set' ? 'ok' : 'warn')} data-state={state}>{t(`calib.state.${state}` as Key)}</span>;
}

/** Commanded against measured travel gives the corrected steps per mm for Mach3's Motor Tuning. */
function AxisCalculator() {
  const { t } = useT();
  const [axis, setAxis] = useState<'X' | 'Y'>('X');
  const [current, setCurrent] = useState<number | null>(null);
  const [commanded, setCommanded] = useState<number | null>(500);
  const [measured, setMeasured] = useState<number | null>(null);
  const result = current !== null && commanded !== null && measured !== null ? correctedSteps(current, commanded, measured) : null;
  return (
    <>
      <ol className="guide-steps">
        <li>{t('calib.axes.1')}</li><li>{t('calib.axes.2')}</li><li>{t('calib.axes.3')}</li><li>{t('calib.axes.4')}</li>
      </ol>
      <div className="fields">
        <SelectField label={t('calib.axis')} value={axis} wide={false} onChange={setAxis} options={[{ value: 'X', label: 'X' }, { value: 'Y', label: 'Y' }]} testId="calib-axis" />
        <NumberField label={t('calib.current')} value={current} optional min={0.0001} max={1e6} step={0.001} onChange={setCurrent} testId="calib-current" />
        <NumberField label={t('calib.commanded')} value={commanded} optional min={1} max={1e5} onChange={setCommanded} testId="calib-commanded" />
        <NumberField label={t('calib.measured')} value={measured} optional min={0.1} max={1e5} step={0.1} onChange={setMeasured} testId="calib-measured" />
      </div>
      {result ? (
        <div className="calib-result" data-testid="calib-result" role="status">
          <span>{t('calib.result', { axis })}</span>
          <b>{result.steps.toFixed(4)}</b>
          <small>{t('calib.error', { pct: (result.errorPct >= 0 ? '+' : '') + result.errorPct.toFixed(2) })}</small>
        </div>
      ) : <p className="hint">{t('calib.fill')}</p>}
      <p className="notice info"><Icon name="info" size={16} />{t('calib.notStored')}</p>
    </>
  );
}

/**
 * Guided machine setup: profile, wire speed and heat, travel limits, program zero, axis calibration,
 * then a sign-off that marks the profile verified. Values still at their samples are flagged throughout.
 */
export function MachineModal() {
  const { t, lang } = useT();
  const { dirty, discard } = useEditSession();
  const state = useStore(projectStore, s => s);
  const project = state.project, profile = activeProfile(state), profiles = state.profiles;
  const [step, setStep] = useState<Step>('profile');
  const [ticks, setTicks] = useState([false, false, false]);
  const layout = activeLayout(project);
  const ready = readiness(profile);
  const update = (part: Partial<MachineProfile>) => setProfiles(profiles.map(p => (p.id === profile.id ? editProfile(p, part) : p)));
  const choose = (id: string) => commit(p => ({ ...p, profileId: id }));
  const clone = (name: string) => {
    const copy = { ...profile, id: newId('profile'), name, verifiedAt: null };
    setProfiles([...profiles, copy]);
    choose(copy.id);
  };
  const remove = async () => {
    const rest = profiles.filter(p => p.id !== profile.id);
    if (!rest.length) return;
    if (!await ask({ title: tr('confirm.deleteProfile'), body: tr('confirm.deleteProfile.body', { name: profile.name }), action: tr('confirm.delete'), danger: true })) return;
    setProfiles(rest);
    choose(rest[0].id);
  };
  const sheetW = layout?.sheetW ?? project.settings.sheetW, sheetH = layout?.sheetH ?? project.settings.sheetH;
  const tooSmall = (profile.maxX !== null && sheetW > profile.maxX) || (profile.maxY !== null && sheetH > profile.maxY);

  const problems: Problem[] = [];
  if (!(profile.feed > 0)) problems.push({ level: 'error', text: t('calib.p.feed') });
  if (profile.power < 0) problems.push({ level: 'error', text: t('calib.p.power') });
  if (!profile.name.trim()) problems.push({ level: 'error', text: t('calib.p.name') });
  if (tooSmall) problems.push({ level: 'warning', text: t('calib.p.sheet', { w: sheetW, h: sheetH }) });
  if (profile.maxX === null || profile.maxY === null) problems.push({ level: 'warning', text: t('calib.p.travel') });
  if (fieldState(profile, 'feed') === 'sample' || fieldState(profile, 'power') === 'sample') problems.push({ level: 'warning', text: t('calib.p.sample') });

  const stepState = (s: Step): 'ok' | 'warn' | 'bad' | undefined => {
    if (s === 'wire') return !(profile.feed > 0) || profile.power < 0 ? 'bad' : fieldState(profile, 'feed') === 'sample' || fieldState(profile, 'power') === 'sample' ? 'warn' : 'ok';
    if (s === 'limits') return profile.maxX === null || profile.maxY === null ? 'warn' : tooSmall ? 'bad' : 'ok';
    if (s === 'verify') return ready === 'verified' ? 'ok' : 'warn';
    if (s === 'profile') return profile.name.trim() ? 'ok' : 'bad';
    return undefined;
  };
  const at = STEPS.indexOf(step);

  return (
    <Modal size="workspace" title={t('calib.title')} subtitle={t('calib.sub')} icon="machine" testId="machine-modal"
      onClose={closeModal} dirty={dirty} onDiscard={discard}
      footer={<ApplyBar problems={problems} onApply={() => applySession(problems)} extra={<>
        <button type="button" className="btn" disabled={at <= 0} onClick={() => setStep(STEPS[at - 1])} data-testid="calib-back"><Icon name="left" size={16} />{t('calib.back')}</button>
        <button type="button" className="btn" disabled={at >= STEPS.length - 1} onClick={() => setStep(STEPS[at + 1])} data-testid="calib-next">{t('calib.next')}<Icon name="right" size={16} /></button>
      </>} />}>
      <ModalTabs<Step> label={t('calib.steps')} active={step} onChange={setStep}
        tabs={STEPS.map((s, i) => ({ id: s, label: `${i + 1}. ${t(`calib.step.${s}` as Key)}`, state: stepState(s) }))} />
      <div className="modal-split calib">
        <section className="modal-side wide-side" role="tabpanel" aria-label={t(`calib.step.${step}` as Key)}>
          {step === 'profile' && (
            <div className="fields">
              <SelectField label={t('machine.profile')} value={profile.id} onChange={choose} testId="profile" options={profiles.map(p => ({ value: p.id, label: p.name || '—' }))} />
              <div className="wide btn-row">
                <button type="button" className="btn" onClick={() => clone(t('machine.add'))}>{t('machine.add')}</button>
                <button type="button" className="btn" onClick={() => clone(t('machine.copy', { name: profile.name }))}>{t('machine.duplicate')}</button>
                <button type="button" className="btn danger" disabled={profiles.length < 2} onClick={() => void remove()}>{t('machine.delete')}</button>
              </div>
              <TextField label={t('machine.name')} value={profile.name} onChange={name => update({ name })} testId="profile-name" />
              <p className="hint wide">{t('calib.profileHint')}</p>
            </div>
          )}
          {step === 'wire' && (
            <>
              <p className="notice warn">{t('machine.warning')}</p>
              <div className="fields">
                <div className="field-with-state">
                  <NumberField label={t('machine.feed')} value={profile.feed} min={0} max={100000} step={10} onChange={v => { if (v !== null) update({ feed: v }); }} testId="feed" tip={t('tip.feed')} />
                  <StateTag state={fieldState(profile, 'feed')} />
                </div>
                <div className="field-with-state">
                  <NumberField label={t('machine.power')} value={profile.power} min={0} max={100000} step={10} onChange={v => { if (v !== null) update({ power: v }); }} testId="power" tip={t('tip.power')} />
                  <StateTag state={fieldState(profile, 'power')} />
                </div>
              </div>
              <Check label={t('machine.m5')} checked={profile.m5} onChange={m5 => update({ m5 })} testId="m5" />
            </>
          )}
          {step === 'limits' && (
            <>
              <div className="fields">
                <div className="field-with-state">
                  <NumberField label={t('machine.maxX')} value={profile.maxX} optional min={1} max={100000} onChange={maxX => update({ maxX })} testId="max-x" />
                  <StateTag state={fieldState(profile, 'maxX')} />
                </div>
                <div className="field-with-state">
                  <NumberField label={t('machine.maxY')} value={profile.maxY} optional min={1} max={100000} onChange={maxY => update({ maxY })} testId="max-y" />
                  <StateTag state={fieldState(profile, 'maxY')} />
                </div>
              </div>
              <p className="hint">{t('machine.travelHint')}</p>
              {tooSmall && <p className="notice bad" data-testid="calib-too-small">{t('calib.p.sheet', { w: sheetW, h: sheetH })}</p>}
            </>
          )}
          {step === 'zero' && (
            <>
              <p className="hint">{t('calib.zero.body')}</p>
              <ul className="checklist"><li>{t('calib.zero.1')}</li><li>{t('calib.zero.2')}</li><li>{t('calib.zero.3')}</li></ul>
              <p className="hint">{t('calib.zero.start')}</p>
            </>
          )}
          {step === 'axes' && <AxisCalculator />}
          {step === 'verify' && (
            <>
              <p className="hint">{t('calib.verify.body')}</p>
              {(['calib.verify.1', 'calib.verify.2', 'calib.verify.3'] as const).map((k, i) => (
                <Check key={k} label={t(k)} checked={ticks[i]} testId={`verify-${i + 1}`} onChange={v => setTicks(x => x.map((y, j) => (j === i ? v : y)))} />
              ))}
              {ready === 'incomplete' && <p className="notice warn">{t('calib.verify.incomplete')}</p>}
              <div className="btn-row">
                <button type="button" className="btn primary" disabled={ready === 'incomplete' || !ticks.every(Boolean)} data-testid="mark-verified"
                  onClick={() => setProfiles(profiles.map(p => (p.id === profile.id ? { ...p, verifiedAt: new Date().toISOString() } : p)))}>
                  <Icon name="ok" size={16} />{t('calib.verify.mark')}
                </button>
                {profile.verifiedAt && <button type="button" className="btn" onClick={() => setProfiles(profiles.map(p => (p.id === profile.id ? { ...p, verifiedAt: null } : p)))}>{t('calib.verify.clear')}</button>}
              </div>
            </>
          )}
        </section>
        <aside className="modal-main calib-status" aria-label={t('calib.status')}>
          <div className={'readiness ' + ready} data-testid="calib-readiness">
            <Icon name={ready === 'verified' ? 'ok' : 'warn'} />
            <span><b>{t(`calib.ready.${ready}` as Key)}</b>
              {profile.verifiedAt && <small>{t('calib.verifiedOn', { date: new Date(profile.verifiedAt).toLocaleDateString(lang === 'km' ? 'km-KH' : 'en-GB') })}</small>}</span>
          </div>
          <ul className="value-list" data-testid="calib-values">
            <li><span>{t('machine.feed')}</span><b>F{profile.feed}</b><StateTag state={fieldState(profile, 'feed')} /></li>
            <li><span>{t('machine.power')}</span><b>S{profile.power}</b><StateTag state={fieldState(profile, 'power')} /></li>
            <li><span>{t('machine.maxX')}</span><b>{profile.maxX ?? '—'}</b><StateTag state={fieldState(profile, 'maxX')} /></li>
            <li><span>{t('machine.maxY')}</span><b>{profile.maxY ?? '—'}</b><StateTag state={fieldState(profile, 'maxY')} /></li>
            <li><span>M5</span><b>{profile.m5 ? t('calib.on') : t('calib.off')}</b></li>
          </ul>
          {step === 'zero' && layout && (
            <div className="preview-box small">
              <SheetPreview layout={layout} designs={project.designs} sheet={0} label={t('calib.zero.preview')} testId="zero-preview" />
            </div>
          )}
        </aside>
      </div>
    </Modal>
  );
}
