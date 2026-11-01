import type { ShopData } from '../types/shop';
import { StorageError } from './db';

/** A database of its own, so shop records can never put the cutting projects at risk during an upgrade. */
const DB_NAME = 'rieb-snor-shop', STORE = 'data', KEY = 'main';

export class ShopConflict extends Error {}

let opening: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new StorageError('unavailable')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new StorageError('unavailable', req.error));
  });
  opening.catch(() => { opening = null; });
  return opening;
}

export async function loadShop(): Promise<unknown> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new StorageError('failed', req.error));
  });
}

/** Everything saves in one transaction, and only over the revision this tab last saw. */
export async function saveShop(data: ShopData, expected: number): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readwrite'), s = t.objectStore(STORE);
    let conflict = false;
    const read = s.get(KEY);
    read.onsuccess = () => {
      const current = (read.result as ShopData | undefined)?.rev ?? 0;
      if (current !== expected) { conflict = true; t.abort(); return; }
      s.put(data, KEY);
    };
    t.oncomplete = () => resolve();
    t.onabort = () => reject(conflict ? new ShopConflict() : new StorageError(t.error?.name === 'QuotaExceededError' ? 'quota' : 'failed', t.error));
    t.onerror = () => undefined;
  });
}
