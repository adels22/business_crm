import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { buildViews, type CustomerView } from '../domain/derive';
import { normalizePhone } from '../domain/phone';
import type { CallLog, CallResult, Customer, Dataset, FollowUp, ImportBatch, LocalDate, LocalTime, Product, Status, Workspace } from '../domain/types';
import { getMeta, loadDataset, newId, replaceAll, requestPersistence, setMeta, writeChange, type Change } from './db';
import { buildDemoDataset } from './demo';

const WS_KEY = 'danisman-crm.workspace';
const EMPTY: Dataset = { customers: [], calls: [], followUps: [], imports: [] };

export interface CustomerInput {
  fullName: string;
  phone: string;
  region: string;
  sector: string;
  status: Status;
  products: Product[];
}

export interface LogCallInput {
  customerId: string;
  date: LocalDate;
  time: LocalTime | null;
  result: CallResult;
  note: string;
  updateStatus: boolean;
  completeOpen: boolean;
  next: { date: LocalDate; time: LocalTime | null } | null;
}

export interface Toast {
  id: number;
  text: string;
  undo?: () => void;
}

interface Store {
  ready: boolean;
  workspace: Workspace;
  data: Dataset;
  views: Map<string, CustomerView>;
  lastBackupAt: string | null;
  toast: Toast | null;
  showToast(text: string, undo?: () => void): void;
  dismissToast(): void;
  switchWorkspace(ws: Workspace): void;
  saveCustomer(input: CustomerInput, id?: string, followUp?: { date: LocalDate; time: LocalTime | null } | null): Promise<Customer>;
  logCall(input: LogCallInput): Promise<void>;
  postpone(followUpId: string, date: LocalDate, time: LocalTime | null): Promise<void>;
  complete(followUpId: string): Promise<void>;
  reopen(followUpId: string): Promise<void>;
  commitImport(batch: ImportBatch, rows: { customer: Customer; calls: CallLog[]; followUps: FollowUp[] }[]): Promise<void>;
  restore(ds: Dataset): Promise<void>;
  resetDemo(): Promise<void>;
  markBackedUp(): Promise<void>;
}

const Ctx = createContext<Store | null>(null);

function readWorkspace(): Workspace {
  try {
    const v = localStorage.getItem(WS_KEY);
    if (v === 'main' || v === 'demo') return v;
  } catch { /* özel pencere vb. */ }
  return 'demo';
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [workspace, setWorkspace] = useState<Workspace>(readWorkspace);
  const [data, setData] = useState<Dataset>(EMPTY);
  const [ready, setReady] = useState(false);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    (async () => {
      let ds = await loadDataset(workspace);
      if (workspace === 'demo' && !(await getMeta<boolean>('demo', 'seeded'))) {
        ds = buildDemoDataset();
        await replaceAll('demo', ds);
        await setMeta('demo', 'seeded', true);
      }
      const lb = (await getMeta<string>(workspace, 'lastBackupAt')) ?? null;
      if (!cancelled) {
        setData(ds);
        setLastBackupAt(lb);
        setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [workspace]);

  const views = useMemo(() => buildViews(data), [data]);

  /** Önce diske yazar, sonra ekranı günceller; böylece ekran kaydedilmemiş veri göstermez. */
  const apply = useCallback(async (change: Change) => {
    await writeChange(workspace, change);
    setData((prev) => {
      const next = { ...prev };
      for (const [k, rows] of Object.entries(change.put ?? {}) as [keyof Dataset, { id: string }[]][]) {
        const byId = new Map((prev[k] as { id: string }[]).map((r) => [r.id, r]));
        for (const r of rows) byId.set(r.id, r);
        (next[k] as unknown) = [...byId.values()];
      }
      return next;
    });
    if (workspace === 'main') void requestPersistence();
  }, [workspace]);

  const showToast = useCallback((text: string, undo?: () => void) => {
    setToast({ id: Date.now(), text, undo });
  }, []);

  const store: Store = {
    ready, workspace, data, views, lastBackupAt, toast, showToast,
    dismissToast: () => setToast(null),

    switchWorkspace(ws) {
      try { localStorage.setItem(WS_KEY, ws); } catch { /* yok say */ }
      setWorkspace(ws);
    },

    async saveCustomer(input, id, followUp) {
      const now = new Date().toISOString();
      const existing = id ? dataRef.current.customers.find((c) => c.id === id) : undefined;
      const customer: Customer = {
        ...(existing ?? { id: newId(), source: workspace === 'demo' ? 'demo' : 'manual', createdAt: now }),
        ...input,
        fullName: input.fullName.trim(),
        phone: input.phone.trim(),
        phoneNorm: normalizePhone(input.phone),
        region: input.region.trim(),
        sector: input.sector.trim(),
        updatedAt: now,
      } as Customer;
      const fus: FollowUp[] = [];
      if (followUp !== undefined) {
        const open = dataRef.current.followUps.filter((f) => f.customerId === customer.id && f.status === 'open');
        const first = open.sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))[0];
        if (followUp && first) {
          if (first.dueDate !== followUp.date || first.dueTime !== followUp.time) {
            fus.push({ ...first, dueDate: followUp.date, dueTime: followUp.time,
              postponements: [...first.postponements, { fromDate: first.dueDate, fromTime: first.dueTime, at: now }] });
          }
        } else if (followUp) {
          fus.push({ id: newId(), customerId: customer.id, dueDate: followUp.date, dueTime: followUp.time,
            status: 'open', postponements: [], source: customer.source === 'demo' ? 'demo' : 'manual', createdAt: now });
        } else if (first) {
          // Kullanıcı takip tarihini boşalttı: takip silinmez, tamamlandı sayılır.
          for (const f of open) fus.push({ ...f, status: 'done', completedAt: now });
        }
      }
      await apply({ put: { customers: [customer], followUps: fus } });
      return customer;
    },

    async logCall(input) {
      const now = new Date().toISOString();
      const ds = dataRef.current;
      const customer = ds.customers.find((c) => c.id === input.customerId);
      if (!customer) throw new Error('Müşteri bulunamadı');
      const src = customer.source === 'demo' ? 'demo' : 'manual';
      const call: CallLog = {
        id: newId(), customerId: customer.id, date: input.date, time: input.time,
        result: input.result, note: input.note.trim(), source: src, createdAt: now,
      };
      const fus: FollowUp[] = [];
      if (input.completeOpen) {
        for (const f of ds.followUps) {
          if (f.customerId === customer.id && f.status === 'open') fus.push({ ...f, status: 'done', completedAt: now });
        }
      }
      if (input.next) {
        fus.push({ id: newId(), customerId: customer.id, dueDate: input.next.date, dueTime: input.next.time,
          status: 'open', postponements: [], source: src, createdAt: now });
      }
      const customers = input.updateStatus && customer.status !== input.result
        ? [{ ...customer, status: input.result as Status, updatedAt: now }]
        : [];
      await apply({ put: { calls: [call], followUps: fus, customers } });
    },

    async postpone(id, date, time) {
      const f = dataRef.current.followUps.find((x) => x.id === id);
      if (!f) return;
      const now = new Date().toISOString();
      await apply({ put: { followUps: [{ ...f, dueDate: date, dueTime: time,
        postponements: [...f.postponements, { fromDate: f.dueDate, fromTime: f.dueTime, at: now }] }] } });
    },

    async complete(id) {
      const f = dataRef.current.followUps.find((x) => x.id === id);
      if (!f) return;
      await apply({ put: { followUps: [{ ...f, status: 'done', completedAt: new Date().toISOString() }] } });
    },

    async reopen(id) {
      const f = dataRef.current.followUps.find((x) => x.id === id);
      if (!f) return;
      const { completedAt: _drop, ...rest } = f;
      void _drop;
      await apply({ put: { followUps: [{ ...rest, status: 'open' }] } });
    },

    async commitImport(batch, rows) {
      await apply({ put: {
        imports: [batch],
        customers: rows.map((r) => r.customer),
        calls: rows.flatMap((r) => r.calls),
        followUps: rows.flatMap((r) => r.followUps),
      } });
    },

    async restore(ds) {
      await replaceAll(workspace, ds);
      setData(ds);
    },

    async resetDemo() {
      const ds = buildDemoDataset();
      await replaceAll('demo', ds);
      if (workspace === 'demo') setData(ds);
    },

    async markBackedUp() {
      const at = new Date().toISOString();
      await setMeta(workspace, 'lastBackupAt', at);
      setLastBackupAt(at);
    },
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider eksik');
  return s;
}
