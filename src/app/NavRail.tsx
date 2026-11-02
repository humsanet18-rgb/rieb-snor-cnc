import { Icon, type IconName } from '../components/icons';
import { useStore } from '../stores/store';
import { go, uiStore, type Section } from '../stores/ui-store';
import { useT, type Key } from './i18n';
import { SECTIONS, useFlow, type FlowStep } from './sections';

const GROUPS = ['home', 'design', 'produce', 'manage'] as const;

/** The full list of screens: a sidebar on wide screens, a drawer from the More tab on phones. */
export function NavRail() {
  const { t } = useT();
  const section = useStore(uiStore, s => s.section);
  const open = useStore(uiStore, s => s.drawer === 'menu');
  const flow = useFlow();
  return (
    <nav className={'rail' + (open ? ' open' : '')} aria-label={t('nav.main')} data-testid="rail">
      {GROUPS.map(g => (
        <div className="rail-group" key={g} role="group" aria-label={g === 'home' ? undefined : t(`nav.group.${g}` as Key)}>
          {g !== 'home' && <span className="rail-label" aria-hidden="true">{t(`nav.group.${g}` as Key)}</span>}
          {SECTIONS.filter(s => s.group === g).map(s => {
            const state = s.id in flow ? flow[s.id as FlowStep] : null, label = t(`nav.section.${s.id}` as Key);
            return (
              <button type="button" key={s.id} className={'rail-item' + (section === s.id ? ' on' : '')} aria-current={section === s.id ? 'page' : undefined}
                title={label} onClick={() => go(s.id)} data-testid={`nav-${s.id}`}>
                <Icon name={s.icon} />
                <span className="rail-text">{label}</span>
                {state && state !== 'todo' && <><i className={`dot ${state}`} aria-hidden="true" /><span className="sr">{t(`flow.${state}` as Key)}</span></>}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

const TABS: { id: Section; icon: IconName; label: Key }[] = [
  { id: 'home', icon: 'home', label: 'nav.section.home' },
  { id: 'import', icon: 'upload', label: 'nav.short.import' },
  { id: 'nest', icon: 'nest', label: 'nav.short.nest' },
  { id: 'path', icon: 'path', label: 'nav.short.path' }
];

/** Thumb-reach navigation on phones; everything else is one tap away under More. */
export function BottomNav() {
  const { t } = useT();
  const section = useStore(uiStore, s => s.section);
  const menu = useStore(uiStore, s => s.drawer === 'menu');
  const inTabs = TABS.some(x => x.id === section);
  return (
    <nav className="bottom-nav" aria-label={t('nav.main')}>
      {TABS.map(x => (
        <button type="button" key={x.id} className={section === x.id && !menu ? 'on' : ''} aria-current={section === x.id ? 'page' : undefined}
          onClick={() => go(x.id)} data-testid={`tab-${x.id}`}>
          <Icon name={x.icon} /><span>{t(x.label)}</span>
        </button>
      ))}
      <button type="button" className={menu || !inTabs ? 'on' : ''} aria-expanded={menu} onClick={() => uiStore.patch({ drawer: menu ? null : 'menu' })} data-testid="tab-more">
        <Icon name="menu" /><span>{t('nav.more')}</span>
      </button>
    </nav>
  );
}
