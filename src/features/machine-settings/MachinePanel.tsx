import { tr, useT } from '../../app/i18n';
import { Check, NumberField, PanelCard, SelectField, TextField } from '../../components/ui';
import { ask } from '../../stores/confirm-store';
import { activeProfile, commit, projectStore, setProfiles } from '../../stores/project-store';
import { useStore } from '../../stores/store';
import type { MachineProfile } from '../../types/project';
import { newId } from '../nesting/model';

export function MachinePanel() {
  const { t } = useT();
  const state = useStore(projectStore, s => s);
  const profile = activeProfile(state), profiles = state.profiles;
  const update = (part: Partial<MachineProfile>) => setProfiles(profiles.map(p => p.id === profile.id ? { ...p, ...part } : p));
  const choose = (id: string) => commit(p => ({ ...p, profileId: id }));
  const clone = (name: string) => {
    const copy = { ...profile, id: newId('profile'), name };
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
  return (
    <>
      <p className="notice warn">{t('machine.warning')}</p>
      <PanelCard title={t('card.profile')} icon="machine">
        <div className="fields">
          <SelectField label={t('machine.profile')} value={profile.id} onChange={choose} testId="profile" options={profiles.map(p => ({ value: p.id, label: p.name || '—' }))} />
          <div className="wide btn-row">
            <button type="button" className="btn" onClick={() => clone(t('machine.add'))}>{t('machine.add')}</button>
            <button type="button" className="btn" onClick={() => clone(t('machine.copy', { name: profile.name }))}>{t('machine.duplicate')}</button>
            <button type="button" className="btn danger" disabled={profiles.length < 2} onClick={() => void remove()}>{t('machine.delete')}</button>
          </div>
          <TextField label={t('machine.name')} value={profile.name} onChange={name => update({ name })} testId="profile-name" />
        </div>
      </PanelCard>
      <PanelCard title={t('card.wire')} icon="path">
        <div className="fields">
          <NumberField label={t('machine.feed')} value={profile.feed} min={0} max={100000} step={10} onChange={v => { if (v !== null) update({ feed: v }); }} testId="feed" tip={t('tip.feed')} />
          <NumberField label={t('machine.power')} value={profile.power} min={0} max={100000} step={10} onChange={v => { if (v !== null) update({ power: v }); }} testId="power" tip={t('tip.power')} />
        </div>
      </PanelCard>
      <PanelCard title={t('card.program')} icon="file">
        <Check label={t('machine.m5')} checked={profile.m5} onChange={m5 => update({ m5 })} testId="m5" />
      </PanelCard>
      <PanelCard title={t('card.travel')} icon="ruler">
        <div className="fields">
          <NumberField label={t('machine.maxX')} value={profile.maxX} optional min={1} max={100000} onChange={maxX => update({ maxX })} testId="max-x" />
          <NumberField label={t('machine.maxY')} value={profile.maxY} optional min={1} max={100000} onChange={maxY => update({ maxY })} testId="max-y" />
          <p className="hint wide">{t('machine.travelHint')}</p>
        </div>
      </PanelCard>
    </>
  );
}
