import { useEffect, useRef } from 'react';
import { addFiles } from './actions';

let open: (() => void) | null = null;

/** Opens the SVG file chooser from any screen. */
export const pickSvgFiles = (): void => open?.();

/** The one SVG file input in the app; buttons on several screens open it. */
export function FilePicker() {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    open = () => input.current?.click();
    return () => { open = null; };
  }, []);
  return (
    <input ref={input} type="file" accept=".svg,image/svg+xml" multiple hidden data-testid="file-input"
      onChange={e => { void addFiles([...(e.target.files ?? [])]); e.target.value = ''; }} />
  );
}
