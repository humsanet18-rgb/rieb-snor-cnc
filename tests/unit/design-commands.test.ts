import { describe, expect, it } from 'vitest';
import { allKeys } from '../../src/app/i18n';
import { COMMANDS, keyName, MENUS } from '../../src/features/design/commands';
import { DEFAULT_TOOLBAR } from '../../src/features/design/design-store';
import { TOOL_DEFS } from '../../src/features/design/Toolbars';

const key = (init: KeyboardEventInit) => keyName(new KeyboardEvent('keydown', init));

describe('design command registry', () => {
  it('every menu and toolbar entry is a real command', () => {
    const ids = new Set(COMMANDS.map(c => c.id));
    expect(ids.size).toBe(COMMANDS.length);
    for (const m of MENUS) for (const id of m.items) if (id !== '|') expect(ids.has(id), `${m.id}: ${id}`).toBe(true);
    for (const id of DEFAULT_TOOLBAR) if (id !== '|') expect(ids.has(id), id).toBe(true);
  });

  it('no two commands or tools share a shortcut', () => {
    const keys = [...COMMANDS.map(c => c.keys), ...TOOL_DEFS.map(t => t.keys)].filter(Boolean);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every label is translated in both languages', () => {
    const km = new Set(allKeys.km);
    for (const c of COMMANDS) expect(km.has(c.label), c.id).toBe(true);
    for (const m of MENUS) expect(km.has(m.label), m.id).toBe(true);
    expect(allKeys.km.length).toBe(allKeys.en.length);
  });

  it('names keys the way commands list them', () => {
    expect(key({ key: 'g', ctrlKey: true })).toBe('Ctrl+G');
    expect(key({ key: 'P', ctrlKey: true, shiftKey: true })).toBe('Ctrl+Shift+P');
    expect(key({ key: '+', shiftKey: true })).toBe('+');
    expect(key({ key: '=' })).toBe('+');
    expect(key({ key: 'F4', shiftKey: true })).toBe('Shift+F4');
    expect(key({ key: 'Escape' })).toBe('Esc');
    expect(key({ key: 'PageUp', shiftKey: true })).toBe('Shift+PageUp');
    expect(key({ key: 'l' })).toBe('L');
  });
});
