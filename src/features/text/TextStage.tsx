import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../../app/i18n';
import { Icon } from '../../components/icons';
import { IconButton } from '../../components/ui';
import { useStore } from '../../stores/store';
import { togglePanel } from '../../stores/ui-store';
import type { Polygon } from '../../types/geometry';
import { SMALL_PIECE_MM } from './geometry';
import { fontOf, inputKey, textStore } from './text-store';

const ringD = (r: Polygon) => 'M' + r.map(p => `${p[0]} ${p[1]}`).join('L') + 'z';
type Box = { x: number; y: number; w: number; h: number };

/** The text in the centre of the screen: live while typing, then the exact traced outlines. */
export function TextStage() {
  const { t } = useT();
  const s = useStore(textStore, x => x);
  const key = inputKey(s), font = fontOf(s);
  const traced = s.result && s.result.key === key ? s.result : null;
  const lines = s.text.split(/\r?\n/);
  const fontSize = s.ratio && font && s.ratio.font === font.id ? s.refHeight / s.ratio.value : null;
  const live = useRef<SVGGElement>(null);
  const [liveBox, setLiveBox] = useState<Box | null>(null);
  useLayoutEffect(() => {
    if (traced || !live.current || !fontSize) { setLiveBox(null); return; }
    const measure = () => {
      const b = live.current?.getBBox();
      if (b && b.width > 0) setLiveBox({ x: b.x, y: b.y, w: b.width, h: b.height });
    };
    measure();
    // Webfonts may still be arriving; measure again once they are in.
    void document.fonts.ready.then(measure);
  }, [traced, s.text, fontSize, s.align, s.lineGap, font?.family, font?.weight]);

  const curves = useMemo(() => traced?.built.parts.map(p => ({
    d: [...p.outers, ...p.holes].map(ringD).join(''), small: Math.min(p.bbox.x1 - p.bbox.x0, p.bbox.y1 - p.bbox.y0) < SMALL_PIECE_MM, b: p.bbox
  })) ?? [], [traced]);

  const box: Box | null = traced ? { x: 0, y: 0, w: traced.summary.width, h: traced.summary.height } : liveBox;
  const pad = box ? Math.max(box.w, box.h) * 0.08 + s.refHeight * 0.6 : 0;
  const viewBox = box ? `${box.x - pad - s.refHeight * 0.5} ${box.y - pad} ${box.w + pad * 2 + s.refHeight * 0.5} ${box.h + pad * 2}` : '0 0 100 100';
  const k = box ? Math.max(box.w, box.h) / 600 : 1;
  const anchor = s.align === 'left' ? 'start' : s.align === 'right' ? 'end' : 'middle';
  const lineStep = fontSize ? fontSize * 1.9 + s.lineGap : 0;
  const glyph = s.refGlyph.trim() || 'ក', barX = box ? box.x - s.refHeight * 0.35 : 0;

  return (
    <section className="canvas-area text-stage" aria-label={traced ? t('text.stage.curves') : t('text.stage.preview')} data-testid="text-stage">
      <div className="canvas-bar">
        <div className="group">
          <span className="tb-left"><IconButton icon="panelLeft" label={t('panel.show')} onClick={() => togglePanel('left')} testId="show-panel" /></span>
          <span className={'stage-mode' + (traced ? ' ok' : '')}><Icon name={traced ? 'path' : 'text'} size={16} />{traced ? t('text.stage.curves') : t('text.stage.preview')}</span>
        </div>
        {box && (
          <div className="group stage-dims" data-testid="stage-dims">
            <Icon name="ruler" size={16} />
            {!traced && <span className="hint">{t('text.stage.approx')}:</span>}
            <b>{box.w.toFixed(0)} × {box.h.toFixed(0)} mm</b>
          </div>
        )}
      </div>
      <div className="canvas-wrap stage-wrap">
        {!s.text.trim() ? (
          <div className="empty"><span className="empty-icon"><Icon name="text" size={28} /></span><p>{t('text.stage.empty')}</p></div>
        ) : (
          <svg viewBox={viewBox} preserveAspectRatio="xMidYMid meet" role="img" aria-label={s.text} className="stage-svg">
            {traced ? (
              <g data-testid="text-curves">
                {curves.map((c, i) => (
                  <g key={i} className={'curve' + (c.small ? ' small' : '')}>
                    <path d={c.d} fillRule="evenodd" vectorEffect="non-scaling-stroke" />
                    {c.small && <rect x={c.b.x0 - 2 * k} y={c.b.y0 - 2 * k} width={c.b.x1 - c.b.x0 + 4 * k} height={c.b.y1 - c.b.y0 + 4 * k} vectorEffect="non-scaling-stroke"><title>{t('text.stage.small')}</title></rect>}
                  </g>
                ))}
                <g className="dims">
                  <path d={`M0 ${-pad * 0.4}H${box!.w}M0 ${-pad * 0.4 - 4 * k}v${8 * k}M${box!.w} ${-pad * 0.4 - 4 * k}v${8 * k}`} vectorEffect="non-scaling-stroke" />
                  <text x={box!.w / 2} y={-pad * 0.4 - 6 * k} fontSize={13 * k} textAnchor="middle">{box!.w.toFixed(1)} mm</text>
                  <path d={`M${box!.w + pad * 0.4} 0V${box!.h}M${box!.w + pad * 0.4 - 4 * k} 0h${8 * k}M${box!.w + pad * 0.4 - 4 * k} ${box!.h}h${8 * k}`} vectorEffect="non-scaling-stroke" />
                  <text x={box!.w + pad * 0.4 + 6 * k} y={box!.h / 2} fontSize={13 * k} transform={`rotate(90 ${box!.w + pad * 0.4 + 6 * k} ${box!.h / 2})`} textAnchor="middle">{box!.h.toFixed(1)} mm</text>
                </g>
              </g>
            ) : fontSize && font ? (
              <>
                <g ref={live} className="live-text" style={{ fontFamily: `"${font.family}"`, fontWeight: font.weight }} fontSize={fontSize} textAnchor={anchor} data-testid="text-live">
                  {lines.map((l, i) => <text key={i} x={0} y={i * lineStep} lang="km">{l || ' '}</text>)}
                </g>
                {box && (
                  <g className="ref-bar" data-testid="ref-bar">
                    <path d={`M${barX} ${-s.refHeight}V0M${barX - 4 * k} ${-s.refHeight}h${8 * k}M${barX - 4 * k} 0h${8 * k}`} vectorEffect="non-scaling-stroke" />
                    <text x={barX} y={-s.refHeight - 8 * k} fontSize={13 * k} textAnchor="middle">{t('text.stage.ref', { glyph, h: s.refHeight })}</text>
                  </g>
                )}
              </>
            ) : null}
          </svg>
        )}
      </div>
    </section>
  );
}
