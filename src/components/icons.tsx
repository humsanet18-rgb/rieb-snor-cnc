const PATHS = {
  new: 'M6 3h8l4 4v14H6zM14 3v4h4M12 11v6M9 14h6',
  open: 'M3 7h6l2 2h10v10H3zM3 7V5h6l2 2',
  save: 'M5 3h12l2 2v16H5zM8 3v6h7V3M8 21v-7h8v7',
  undo: 'M9 7L4 12l5 5M4 12h10a6 6 0 0 1 0 12',
  redo: 'M15 7l5 5-5 5M20 12H10a6 6 0 0 0 0 12',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2',
  moon: 'M20 14A8 8 0 1 1 10 4a7 7 0 0 0 10 10z',
  help: 'M9 9a3 3 0 1 1 4.5 2.6c-1 .6-1.5 1.2-1.5 2.4M12 17.5v.5M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M5 19l3-3M16 8l3-3',
  close: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  fit: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
  play: 'M7 4l13 8-13 8z',
  pause: 'M7 4h4v16H7zM14 4h4v16h-4z',
  rewind: 'M5 5v14M19 5L9 12l10 7z',
  rotate: 'M4 12a8 8 0 1 0 2.5-5.8L4 8.5M4 4v4.5h4.5',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14',
  report: 'M6 3h12v18H6zM9 8h6M9 12h6M9 16h4',
  copy: 'M8 8h12v12H8zM4 4h12v3M4 4v12h3',
  upload: 'M12 16V5M7 10l5-5 5 5M4 19h16',
  check: 'M5 13l4 4 10-11',
  warn: 'M12 4l9 16H3zM12 10v5M12 17.5v.5'
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
