import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toTAP } from '../../src/engines/gcode-engine/tap';
import { checkTap, type TapContext } from '../../src/features/export/gcode-checks';
import { correctedSteps, editProfile, fieldState, readiness } from '../../src/features/machine-settings/calibration';
import { defaultProfile } from '../../src/features/nesting/model';
import type { MachineProfile } from '../../src/types/project';

// The store saves to IndexedDB; the tests only need to see when it would.
const saved = vi.hoisted(() => ({ projects: 0, profiles: 0 }));
vi.mock('../../src/services/db', async importOriginal => ({
  ...(await importOriginal<typeof import('../../src/services/db')>()),
  saveProject: vi.fn(async () => { saved.projects++; }),
  saveProfiles: vi.fn(async () => { saved.profiles++; })
}));
const store = await import('../../src/stores/project-store');
const { projectStore, commit, undo, beginTransaction, commitTransaction, rollbackTransaction, transactionDirty, inTransaction, flushSave } = store;

const square: [number, number][] = [[10, 10], [110, 10], [110, 60], [10, 60], [10, 10]];
const ctx = (o: Partial<TapContext> = {}): TapContext =>
  ({ sheetW: 1000, sheetH: 480, maxX: 1200, maxY: 600, feed: 500, power: 300, m5: true, returnHome: true, blocking: 0, ...o });
const tap = (path = square, o: { feed?: number; power?: number; m5?: boolean } = {}) =>
  toTAP(path, { name: 'Test', feed: 500, power: 300, m5: true, date: '2026-11-02', ...o });
const status = (r: ReturnType<typeof checkTap>, id: string) => r.checks.find(c => c.id === id)?.status;

describe('G-code checks before download', () => {
  it('passes a file the writer produced for the same profile', () => {
    const r = checkTap(tap(), ctx());
    expect(r.ok).toBe(true);
    expect(r.checks.every(c => c.status === 'pass')).toBe(true);
    expect(r.moves).toBe(5);
    expect(r.extent).toEqual({ x0: 10, y0: 10, x1: 110, y1: 60 });
  });

  it('fails when F, S or M5 differ from the profile', () => {
    expect(status(checkTap(tap(square, { feed: 400 }), ctx()), 'feed')).toBe('fail');
    expect(status(checkTap(tap(square, { power: 200 }), ctx()), 'power')).toBe('fail');
    expect(status(checkTap(tap(square, { m5: false }), ctx()), 'wire-off')).toBe('fail');
    expect(checkTap(tap(square, { feed: 400 }), ctx()).ok).toBe(false);
  });

  it('warns about a cold wire and an unset machine without blocking', () => {
    const r = checkTap(tap(square, { power: 0 }), ctx({ power: 0, maxX: null, maxY: null }));
    expect(status(r, 'power')).toBe('warn');
    expect(status(r, 'machine-bounds')).toBe('warn');
    expect(r.ok).toBe(true);
  });

  it('points at the first move outside the sheet or the machine travel', () => {
    const path: [number, number][] = [[10, 10], [1005, 10], [1005, 60], [10, 10]];
    const r = checkTap(tap(path), ctx({ maxX: 1000 }));
    const sheet = r.checks.find(c => c.id === 'sheet-bounds')!;
    expect(sheet.status).toBe('fail');
    expect(sheet.detail).toBe('2');
    expect(tap(path).split('\r\n')[sheet.line! - 1]).toContain('X1005.00');
    expect(status(r, 'machine-bounds')).toBe('fail');
    expect(r.ok).toBe(false);
  });

  it('flags an open path only when it was meant to return home', () => {
    const open: [number, number][] = [[10, 10], [110, 10], [110, 60]];
    expect(status(checkTap(tap(open), ctx()), 'path-end')).toBe('warn');
    expect(status(checkTap(tap(open), ctx({ returnHome: false })), 'path-end')).toBe('info');
  });

  it('fails a damaged file and outstanding validation errors', () => {
    const broken = tap().replace('N00010 M3 S300', 'N00010 Q3 S300');
    expect(status(checkTap(broken, ctx()), 'syntax')).toBe('fail');
    expect(checkTap(tap(), ctx({ blocking: 2 })).ok).toBe(false);
    expect(checkTap('', ctx()).ok).toBe(false);
  });
});

describe('Machine calibration', () => {
  const p = (o: Partial<MachineProfile> = {}): MachineProfile => ({ ...defaultProfile(), maxX: 1300, maxY: 700, ...o });

  it('tells sample, entered and missing values apart', () => {
    expect(fieldState(p(), 'feed')).toBe('sample');
    expect(fieldState(p({ feed: 450 }), 'feed')).toBe('set');
    expect(fieldState(defaultProfile(), 'maxX')).toBe('unset');
    expect(fieldState(p(), 'maxX')).toBe('set');
  });

  it('is incomplete without travel or a usable feed, verified only once confirmed', () => {
    expect(readiness(defaultProfile())).toBe('incomplete');
    expect(readiness(p({ feed: 0 }))).toBe('incomplete');
    expect(readiness(p({ name: '  ' }))).toBe('incomplete');
    expect(readiness(p())).toBe('unverified');
    expect(readiness(p({ verifiedAt: '2026-11-02T10:00:00.000Z' }))).toBe('verified');
  });

  it('clears the verification when a calibrated value changes, not for the name', () => {
    const v = p({ verifiedAt: '2026-11-02T10:00:00.000Z' });
    expect(editProfile(v, { name: 'Shop A' }).verifiedAt).toBe(v.verifiedAt);
    expect(editProfile(v, { feed: 500 }).verifiedAt).toBe(v.verifiedAt);
    expect(editProfile(v, { feed: 480 }).verifiedAt).toBeNull();
    expect(editProfile(v, { maxY: 650 }).verifiedAt).toBeNull();
    expect(editProfile(v, { m5: true }).verifiedAt).toBeNull();
  });

  it('corrects steps per mm from a measured move', () => {
    const r = correctedSteps(200, 100, 98)!;
    expect(r.steps).toBeCloseTo(204.0816, 3);
    expect(r.errorPct).toBeCloseTo(-2, 6);
    expect(correctedSteps(200, 100, 0)).toBeNull();
    expect(correctedSteps(0, 100, 100)).toBeNull();
  });
});

describe('Modal edit sessions', () => {
  const rename = (name: string) => commit(p => ({ ...p, name }));
  beforeEach(async () => {
    vi.useFakeTimers();
    rollbackTransaction();
    rename('Start');
    await vi.runAllTimersAsync();
    saved.projects = 0; saved.profiles = 0;
  });
  afterEach(() => { rollbackTransaction(); vi.useRealTimers(); });

  it('cancel restores the project, history and save state exactly', async () => {
    const before = projectStore.get();
    beginTransaction();
    expect(inTransaction()).toBe(true);
    expect(transactionDirty()).toBe(false);
    rename('Draft 1'); rename('Draft 2');
    projectStore.patch({ profiles: [...before.profiles, { ...defaultProfile(), id: 'x' }] });
    expect(transactionDirty()).toBe(true);
    expect(projectStore.get().project.name).toBe('Draft 2');
    await vi.runAllTimersAsync();
    expect(saved.projects).toBe(0);
    rollbackTransaction();
    const after = projectStore.get();
    expect(after.project).toBe(before.project);
    expect(after.past).toBe(before.past);
    expect(after.future).toBe(before.future);
    expect(after.profiles).toBe(before.profiles);
    expect(after.saveState).toBe('saved');
    expect(inTransaction()).toBe(false);
    await vi.runAllTimersAsync();
    expect(saved.projects).toBe(0);
  });

  it('apply keeps the changes as one undo step and saves once', async () => {
    const before = projectStore.get();
    beginTransaction();
    rename('A'); rename('B'); rename('C');
    commitTransaction();
    const s = projectStore.get();
    expect(s.project.name).toBe('C');
    expect(s.past).toHaveLength(before.past.length + 1);
    expect(s.past[s.past.length - 1]).toBe(before.project);
    await vi.runAllTimersAsync();
    expect(saved.projects).toBe(1);
    expect(projectStore.get().saveState).toBe('saved');
    undo();
    expect(projectStore.get().project).toBe(before.project);
  });

  it('apply with no change leaves history alone and does not save', async () => {
    const before = projectStore.get();
    beginTransaction();
    commitTransaction();
    expect(projectStore.get().past).toBe(before.past);
    await vi.runAllTimersAsync();
    expect(saved.projects).toBe(0);
  });

  it('a profile change is written only on apply', async () => {
    beginTransaction();
    projectStore.patch({ profiles: [{ ...defaultProfile(), feed: 420 }] });
    await store.persistProfiles();
    expect(saved.profiles).toBe(0);
    commitTransaction();
    await flushSave();
    expect(saved.profiles).toBe(1);
  });
});
