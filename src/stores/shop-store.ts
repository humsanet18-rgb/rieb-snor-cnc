import { tr } from '../app/i18n';
import { emptyShop } from '../features/shop/logic';
import { newId } from '../features/nesting/model';
import { loadShop, saveShop, ShopConflict } from '../services/shop-db';
import { readShop } from '../services/shop-io';
import type { ActivityAction, ShopData } from '../types/shop';
import { Store } from './store';
import { toast } from './ui-store';

export interface ShopState { data: ShopData; status: 'loading' | 'ready' | 'error' }

export const shopStore = new Store<ShopState>({ data: emptyShop(), status: 'loading' });

const HISTORY = 500;
const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('rieb-snor-shop');
if (channel) channel.onmessage = () => void reloadShop();

export async function reloadShop(): Promise<void> {
  try {
    const stored = await loadShop();
    shopStore.set({ data: stored === undefined ? emptyShop() : readShop(stored), status: 'ready' });
  } catch {
    shopStore.patch({ status: 'error' });
  }
}

let queue: Promise<unknown> = Promise.resolve();
let persisted = false;

async function write(next: ShopData, expected: number): Promise<boolean> {
  try {
    await saveShop(next, expected);
    shopStore.set({ data: next, status: 'ready' });
    channel?.postMessage('saved');
    if (!persisted) {
      persisted = true;
      void navigator.storage?.persist?.().catch(() => undefined);
    }
    return true;
  } catch (e) {
    if (e instanceof ShopConflict) {
      await reloadShop();
      toast(tr('shop.conflict'), true);
    } else toast(tr('shop.saveFailed'), true);
    return false;
  }
}

/**
 * Applies one change and logs it. The screen only updates once the save has succeeded,
 * and changes run one at a time, so the screen never shows work that was not stored.
 */
export function changeShop(action: ActivityAction, detail: string, fn: (d: ShopData) => ShopData): Promise<boolean> {
  const run = queue.then(() => {
    const { data } = shopStore.get();
    const changed = fn(data);
    const entry = { id: newId('act'), at: new Date().toISOString(), action, detail: detail.slice(0, 200) };
    return write({ ...changed, rev: data.rev + 1, activity: [entry, ...changed.activity].slice(0, HISTORY) }, data.rev);
  });
  queue = run.catch(() => undefined);
  return run;
}

/** Replaces everything with a checked backup, keeping the revision moving forward. */
export function restoreShop(backup: ShopData): Promise<boolean> {
  return changeShop('restore', '', d => ({ ...backup, rev: d.rev }));
}

/** Records a backup without logging it as a change to the shop. */
export function markBackedUp(): Promise<boolean> {
  const run = queue.then(() => {
    const { data } = shopStore.get();
    return write({ ...data, rev: data.rev + 1, settings: { ...data.settings, lastBackup: new Date().toISOString() } }, data.rev);
  });
  queue = run.catch(() => undefined);
  return run;
}
