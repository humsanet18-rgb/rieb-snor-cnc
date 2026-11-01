import { useEffect, useState } from 'react';
import { Dialog } from '../components/ui';
import { ProjectDialog } from '../features/projects/ProjectDialog';
import { ReportDialog } from '../features/svg-import/ReportDialog';
import { defaultProfile } from '../features/nesting/model';
import { clearAll } from '../services/db';
import { flushSave, projectStore } from '../stores/project-store';
import { useStore } from '../stores/store';
import { savePrefs, toast, uiStore } from '../stores/ui-store';
import { tr, useT } from './i18n';
import { createProject } from './actions';

const close = () => uiStore.patch({ dialog: null });

function HelpDialog() {
  const { t } = useT();
  return (
    <Dialog title={t('help.title')} onClose={close}>
      <p>{t('help.flow')}</p>
      {([1, 2, 3, 4, 5] as const).map(n => (
        <section key={n}><h3>{t(`help.h${n}`)}</h3><p>{t(`help.b${n}`)}</p></section>
      ))}
    </Dialog>
  );
}

const size = (b: number) => (b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${(b / 1e6).toFixed(1)} MB`);

function SettingsDialog() {
  const { t } = useT();
  const lang = useStore(uiStore, s => s.lang), theme = useStore(uiStore, s => s.theme);
  const [usage, setUsage] = useState<string | null>(null);
  useEffect(() => {
    navigator.storage?.estimate?.().then(e => {
      if (e.usage !== undefined && e.quota) setUsage(t('settings.storageUse', { used: size(e.usage), quota: size(e.quota) }));
    }).catch(() => undefined);
  }, [t]);
  const wipe = async () => {
    if (!confirm(t('settings.clearConfirm'))) return;
    try {
      await clearAll();
      projectStore.patch({ profiles: [defaultProfile()] });
      await createProject();
      await flushSave();
      close();
      toast(tr('settings.cleared'));
    } catch (e) { toast(tr('toast.failed', { why: e instanceof Error ? e.message : String(e) }), true); }
  };
  return (
    <Dialog title={t('settings.title')} onClose={close}>
      <div className="fields">
        <div className="field">
          <label htmlFor="set-lang">{t('settings.language')}</label>
          <select id="set-lang" value={lang} onChange={e => { uiStore.patch({ lang: e.target.value as 'km' | 'en' }); savePrefs(); }}>
            <option value="km">ខ្មែរ</option><option value="en">English</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="set-theme">{t('settings.theme')}</label>
          <select id="set-theme" value={theme} onChange={e => { uiStore.patch({ theme: e.target.value as 'light' | 'dark' }); savePrefs(); }}>
            <option value="light">{t('nav.light')}</option><option value="dark">{t('nav.dark')}</option>
          </select>
        </div>
      </div>
      <h3>{t('settings.storage')}</h3>
      <p>{usage ?? t('settings.storageUnknown')}</p>
      <button type="button" className="btn danger" onClick={() => void wipe()}>{t('settings.clear')}</button>
      <p className="hint">{t('settings.privacy')}</p>
    </Dialog>
  );
}

export function Dialogs() {
  const dialog = useStore(uiStore, s => s.dialog);
  if (dialog === 'open') return <ProjectDialog />;
  if (dialog === 'help') return <HelpDialog />;
  if (dialog === 'settings') return <SettingsDialog />;
  if (dialog) return <ReportDialog designId={dialog.report} />;
  return null;
}
