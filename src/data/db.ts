/**
 * Depolama katmanı. Bu sürümde veriler yalnızca bu tarayıcının IndexedDB'sinde durur.
 * Sunucuya geçişte değişecek tek dosya burasıdır.
 */
import { openDB, type IDBPDatabase } from 'idb';
import type { CallLog, Customer, Dataset, FollowUp, ImportBatch, Workspace } from '../domain/types';

const DB_NAMES: Record<Workspace, string> = {
  demo: 'danisman-crm-demo',
  main: 'danisman-crm',
};
const STORES = ['customers', 'calls', 'followUps', 'imports', 'meta'] as const;
type StoreName = (typeof STORES)[number];

const cache = new Map<Workspace, Promise<IDBPDatabase>>();

function db(ws: Workspace) {
  let p = cache.get(ws);
  if (!p) {
    p = openDB(DB_NAMES[ws], 1, {
      upgrade(d) {
        for (const s of STORES) {
          if (!d.objectStoreNames.contains(s)) {
            d.createObjectStore(s, { keyPath: s === 'meta' ? 'key' : 'id' });
          }
        }
      },
    });
    cache.set(ws, p);
  }
  return p;
}

export async function loadDataset(ws: Workspace): Promise<Dataset> {
  const d = await db(ws);
  const [customers, calls, followUps, imports] = await Promise.all([
    d.getAll('customers') as Promise<Customer[]>,
    d.getAll('calls') as Promise<CallLog[]>,
    d.getAll('followUps') as Promise<FollowUp[]>,
    d.getAll('imports') as Promise<ImportBatch[]>,
  ]);
  return { customers, calls, followUps, imports };
}

export interface Change {
  put?: Partial<{ customers: Customer[]; calls: CallLog[]; followUps: FollowUp[]; imports: ImportBatch[] }>;
}

/** Tek işlemde yazar: ya hepsi kaydedilir ya hiçbiri. */
export async function writeChange(ws: Workspace, change: Change): Promise<void> {
  const d = await db(ws);
  const names = Object.keys(change.put ?? {}) as StoreName[];
  if (!names.length) return;
  const tx = d.transaction(names, 'readwrite');
  for (const n of names) {
    const rows = (change.put as Record<string, { id: string }[]>)[n] ?? [];
    for (const r of rows) tx.objectStore(n).put(r);
  }
  await tx.done;
}

export async function replaceAll(ws: Workspace, ds: Dataset): Promise<void> {
  const d = await db(ws);
  const tx = d.transaction(['customers', 'calls', 'followUps', 'imports'], 'readwrite');
  for (const n of ['customers', 'calls', 'followUps', 'imports'] as const) {
    await tx.objectStore(n).clear();
    for (const r of ds[n]) tx.objectStore(n).put(r);
  }
  await tx.done;
}

export async function getMeta<T>(ws: Workspace, key: string): Promise<T | undefined> {
  const d = await db(ws);
  const row = (await d.get('meta', key)) as { key: string; value: T } | undefined;
  return row?.value;
}
export async function setMeta<T>(ws: Workspace, key: string, value: T): Promise<void> {
  const d = await db(ws);
  await d.put('meta', { key, value });
}

/** Tarayıcıdan verilerin kendiliğinden silinmemesini ister. */
export async function requestPersistence(): Promise<boolean | null> {
  if (!navigator.storage?.persist) return null;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}
export async function isPersisted(): Promise<boolean | null> {
  if (!navigator.storage?.persisted) return null;
  return navigator.storage.persisted();
}

export function newId(): string {
  return crypto.randomUUID();
}
