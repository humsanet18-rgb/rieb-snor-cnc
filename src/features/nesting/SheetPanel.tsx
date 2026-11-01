import { useT } from '../../app/i18n';
import { Check, NumberField, SelectField } from '../../components/ui';
import { commit, projectStore } from '../../stores/project-store';
import { useStore } from '../../stores/store';
import type { CornerMode, Settings } from '../../types/project';

export const setSettings = (fn: (s: Settings) => Settings): void =>
  commit(p => ({ ...p, settings: fn(p.settings) }));

const num = (fn: (s: Settings, v: number) => Settings) => (v: number | null) => { if (v !== null) setSettings(s => fn(s, v)); };

export function SheetPanel() {
  const { t } = useT();
  const s = useStore(projectStore, st => st.project.settings);
  const c = s.corners;
  return (
    <div className="fields">
      <NumberField label={t('sheet.width')} value={s.sheetW} scale={10} min={1} max={10000} onChange={num((x, v) => ({ ...x, sheetW: v }))} testId="sheet-w" />
      <NumberField label={t('sheet.height')} value={s.sheetH} scale={10} min={1} max={10000} onChange={num((x, v) => ({ ...x, sheetH: v }))} testId="sheet-h" />
      <NumberField label={t('sheet.thickness')} value={s.thickness} min={0} max={2000} onChange={num((x, v) => ({ ...x, thickness: v }))} />
      <NumberField label={t('sheet.margin')} value={s.margin} min={0} max={500} onChange={num((x, v) => ({ ...x, margin: v }))} testId="margin" />
      <p className="hint wide">{t('sheet.thicknessHint')}</p>
      <SelectField<CornerMode> label={t('sheet.corners')} value={c.mode} testId="corners"
        onChange={mode => setSettings(x => ({ ...x, corners: { ...x.corners, mode } }))}
        options={[
          { value: 'bottom', label: t('sheet.corners.bottom') }, { value: 'top', label: t('sheet.corners.top') },
          { value: 'all', label: t('sheet.corners.all') }, { value: 'none', label: t('sheet.corners.none') }
        ]} />
      {(c.mode === 'top' || c.mode === 'all') && <p className="hint wide">{t('sheet.topHint')}</p>}
      {c.mode !== 'none' && (
        <>
          <NumberField label={t('sheet.leftW')} value={c.leftW} scale={10} step={0.5} min={0} max={1000} onChange={num((x, v) => ({ ...x, corners: { ...x.corners, leftW: v } }))} />
          <NumberField label={t('sheet.rightW')} value={c.rightW} scale={10} step={0.5} min={0} max={1000} onChange={num((x, v) => ({ ...x, corners: { ...x.corners, rightW: v } }))} />
          <NumberField label={t('sheet.cornerH')} value={c.h} scale={10} step={0.5} min={0} max={1000} onChange={num((x, v) => ({ ...x, corners: { ...x.corners, h: v } }))} />
        </>
      )}
      <div className="wide">
        <Check label={t('sheet.start')} checked={s.start.enabled} onChange={enabled => setSettings(x => ({ ...x, start: { ...x.start, enabled } }))} />
      </div>
      {s.start.enabled && (
        <>
          <NumberField label={t('sheet.startX')} value={s.start.x} step={0.5} min={0} max={10000} onChange={num((x, v) => ({ ...x, start: { ...x.start, x: v } }))} />
          <NumberField label={t('sheet.startY')} value={s.start.y} step={0.5} min={0} max={10000} onChange={num((x, v) => ({ ...x, start: { ...x.start, y: v } }))} />
          <NumberField label={t('sheet.startW')} value={s.start.w} step={0.5} min={1} max={500} onChange={num((x, v) => ({ ...x, start: { ...x.start, w: v } }))} />
          <NumberField label={t('sheet.startH')} value={s.start.h} step={0.5} min={1} max={500} onChange={num((x, v) => ({ ...x, start: { ...x.start, h: v } }))} />
        </>
      )}
    </div>
  );
}
