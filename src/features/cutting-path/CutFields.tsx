import { useT } from '../../app/i18n';
import { Check, SelectField } from '../../components/ui';
import { projectStore } from '../../stores/project-store';
import { useStore } from '../../stores/store';
import type { CutOptions, CutOrder } from '../../types/project';
import { setSettings } from '../nesting/SheetPanel';

const ORDERS: CutOrder[] = ['shortest', 'rows', 'columns', 'snake'];

export function CutFields() {
  const { t } = useT();
  const cut = useStore(projectStore, s => s.project.settings.cut);
  const set = (part: Partial<CutOptions>) => setSettings(x => ({ ...x, cut: { ...x.cut, ...part } }));
  return (
    <>
      <SelectField label={t('cut.order')} value={cut.order} testId="cut-order" onChange={order => set({ order })}
        options={ORDERS.map(value => ({ value, label: t(`cut.order.${value}`) }))} />
      {cut.order !== 'shortest' && (
        <>
          <p className="hint">{t('cut.hint')}</p>
          <Check label={t('cut.returnHome')} checked={cut.returnHome} testId="return-home" onChange={returnHome => set({ returnHome })} />
          {!cut.returnHome && <p className="notice warn" data-testid="no-return">{t('cut.noReturn')}</p>}
        </>
      )}
    </>
  );
}
