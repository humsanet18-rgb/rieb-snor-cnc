import { memo, useMemo } from 'react';
import type { ValidationIssue } from '../../engines/toolpath-engine/validate';
import type { Polygon, Stroke } from '../../types/geometry';
import type { Design, Layout } from '../../types/project';
import { partOf, placeItem } from '../nesting/model';

const ringD = (P: Polygon) => 'M' + P.map(q => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join('L') + 'z';
const lineD = (P: Polygon) => P.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join('');

/**
 * A still picture of one sheet for previews inside modals: the foam, clamp zones, pieces, and optionally
 * the wire path and validation marks. It draws from the same layout and stroke data as the main canvas.
 */
export const SheetPreview = memo(function SheetPreview({ layout, designs, sheet, stroke, issues, label, testId }: {
  layout: Layout; designs: Design[]; sheet: number; stroke?: Stroke | null; issues?: ValidationIssue[]; label: string; testId?: string;
}) {
  const s = layout.sheets[Math.min(sheet, layout.sheets.length - 1)];
  const colours = useMemo(() => new Map(designs.map((d, i) => [d.id, i % 6])), [designs]);
  const pieces = useMemo(() => s?.pieces.map(p => {
    const part = partOf(designs, p);
    if (!part) return null;
    const item = placeItem(part, p);
    return { key: p.key, colour: colours.get(p.designId) ?? 0, d: [...item.outers, ...item.holes].map(ringD).join('') };
  }).filter(x => !!x) ?? [], [s, designs, colours]);
  const path = useMemo(() => (stroke?.path.length ? lineD(stroke.path) : ''), [stroke]);
  const pad = Math.max(layout.sheetW, layout.sheetH) * 0.03, r = Math.max(layout.sheetW, layout.sheetH) / 120;
  return (
    <svg className="sheet-preview" viewBox={`${-pad} ${-pad} ${layout.sheetW + pad * 2} ${layout.sheetH + pad * 2}`} preserveAspectRatio="xMidYMid meet"
      role="img" aria-label={label} data-testid={testId}>
      <rect className="foam" width={layout.sheetW} height={layout.sheetH} vectorEffect="non-scaling-stroke" />
      {layout.zones.map((z, i) => <rect key={i} className="zone" x={z.x} y={z.y} width={z.w} height={z.h} vectorEffect="non-scaling-stroke" />)}
      {pieces.map(p => <path key={p!.key} className={`pv-piece d${p!.colour}`} d={p!.d} fillRule="evenodd" vectorEffect="non-scaling-stroke" />)}
      {path && <path className="wire" d={path} vectorEffect="non-scaling-stroke" data-testid={testId ? `${testId}-path` : undefined} />}
      {s && ('box' in s.start
        ? <rect className="start" x={s.start.box.x} y={s.start.box.y} width={s.start.box.w} height={s.start.box.h} vectorEffect="non-scaling-stroke" />
        : <circle className="start" cx={s.start.x} cy={s.start.y} r={r} vectorEffect="non-scaling-stroke" />)}
      {issues?.filter(i => i.at && i.sheet === sheet).map((i, n) => (
        <circle key={n} className={`pv-issue ${i.severity}`} cx={i.at![0]} cy={i.at![1]} r={r * 1.6} vectorEffect="non-scaling-stroke" />
      ))}
      <circle className="origin" r={r} />
    </svg>
  );
});
