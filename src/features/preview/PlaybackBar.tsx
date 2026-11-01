import { useEffect } from 'react';
import { formatDuration, useT } from '../../app/i18n';
import { IconButton } from '../../components/ui';
import { activeProfile, projectStore } from '../../stores/project-store';
import { useStore } from '../../stores/store';
import { uiStore } from '../../stores/ui-store';

const SPEEDS = [1, 5, 10, 25, 50, 100];

const setPlayback = (part: Partial<ReturnType<typeof uiStore.get>['playback']>) =>
  uiStore.patch({ playback: { ...uiStore.get().playback, ...part } });

/** Steps along the real path data at the profile's feed rate times the chosen speed. */
export function PlaybackBar({ total }: { total: number }) {
  const { t, lang } = useT();
  const { position, playing, speed } = useStore(uiStore, s => s.playback);
  const feed = useStore(projectStore, s => activeProfile(s).feed);
  useEffect(() => {
    if (!playing) return;
    let last = performance.now(), id = 0;
    const tick = (now: number) => {
      const mmPerSecond = Math.max(feed, 1) / 60 * uiStore.get().playback.speed;
      const next = uiStore.get().playback.position + (now - last) / 1000 * mmPerSecond;
      last = now;
      if (next >= total) { setPlayback({ position: total, playing: false }); return; }
      setPlayback({ position: next });
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [playing, total, feed]);
  return (
    <div className="playback">
      <IconButton icon="rewind" label={t('play.toStart')} onClick={() => setPlayback({ position: 0, playing: false })} />
      <IconButton icon={playing ? 'pause' : 'play'} label={playing ? t('play.pause') : t('play.play')} testId="play"
        onClick={() => setPlayback({ playing: !playing, position: position >= total ? 0 : position })} />
      <input type="range" min={0} max={Math.ceil(total)} step={1} value={Math.min(position, total)} aria-label={t('play.position')} data-testid="play-position"
        onChange={e => setPlayback({ position: +e.target.value, playing: false })} />
      <span className="play-pos" data-testid="play-readout">{(position / 1000).toFixed(2)} / {(total / 1000).toFixed(2)} {t('unit.m')}{feed > 0 ? ` · ${formatDuration(lang, (total - position) / feed)}` : ''}</span>
      <label className="play-speed">
        {t('play.speed')}
        <select value={speed} onChange={e => setPlayback({ speed: +e.target.value })}>
          {SPEEDS.map(s => <option key={s} value={s}>×{s}</option>)}
        </select>
      </label>
      <span className="play-note">{t('play.note')}</span>
    </div>
  );
}
