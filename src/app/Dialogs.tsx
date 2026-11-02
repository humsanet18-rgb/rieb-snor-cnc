import { useEffect, useState } from 'react';
import { Icon } from '../components/icons';
import { Check, Dialog } from '../components/ui';
import { ReportDialog } from '../features/svg-import/ReportDialog';
import { defaultProfile } from '../features/nesting/model';
import { clearAll } from '../services/db';
import { ask } from '../stores/confirm-store';
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

export function SettingsPage() {
  const { t } = useT();
  const lang = useStore(uiStore, s => s.lang), theme = useStore(uiStore, s => s.theme), guided = useStore(uiStore, s => s.guided);
  const [usage, setUsage] = useState<string | null>(null);
  useEffect(() => {
    navigator.storage?.estimate?.().then(e => {
      if (e.usage !== undefined && e.quota) setUsage(t('settings.storageUse', { used: size(e.usage), quota: size(e.quota) }));
    }).catch(() => undefined);
  }, [t]);
  const wipe = async () => {
    if (!await ask({ title: tr('confirm.clear'), body: tr('settings.clearConfirm'), action: tr('confirm.deleteAll'), danger: true })) return;
    try {
      await clearAll();
      projectStore.patch({ profiles: [defaultProfile()] });
      await createProject();
      await flushSave();
      toast(tr('settings.cleared'));
    } catch (e) { toast(tr('toast.failed', { why: e instanceof Error ? e.message : String(e) }), true); }
  };
  return (
    <div className="page narrow" data-testid="settings">
      <header className="page-head">
        <h1>{t('settings.title')}</h1>
        <p>{t('settings.sub')}</p>
      </header>
      <section className="panel-box">
        <h2 className="box-title">{t('settings.appearance')}</h2>
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
          <div className="wide">
            <Check label={t('settings.guide')} checked={!guided} onChange={v => { uiStore.patch({ guided: !v }); savePrefs(); }} />
          </div>
        </div>
      </section>
      <section className="panel-box">
        <h2 className="box-title">{t('settings.storage')}</h2>
        <p>{usage ?? t('settings.storageUnknown')}</p>
        <p className="hint">{t('settings.privacy')}</p>
        <div><button type="button" className="btn danger" onClick={() => void wipe()}><Icon name="trash" size={16} />{t('settings.clear')}</button></div>
      </section>
    </div>
  );
}

export function Dialogs() {
  const dialog = useStore(uiStore, s => s.dialog);
  if (dialog === 'help') return <HelpDialog />;
  if (dialog) return <ReportDialog designId={dialog.report} />;
  return null;
}
