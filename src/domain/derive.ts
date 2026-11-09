import { addDays, today } from './dates';
import type { CallLog, Customer, Dataset, FollowUp } from './types';

export interface CustomerView {
  customer: Customer;
  /** Tarihi bilinen en yeni görüşme. "Son arama" buradan hesaplanır. */
  lastCall: CallLog | null;
  /** Notu olan en yeni görüşme (tarihsiz notlar en eskiler sayılır). */
  lastNote: CallLog | null;
  /** En erken açık takip. */
  nextFollowUp: FollowUp | null;
  calls: CallLog[];
}

/** Yeni → eski. Tarihsiz kayıtlar en sonda, kendi içinde ekleme sırasına göre. */
export function sortCalls(calls: CallLog[]): CallLog[] {
  return [...calls].sort((a, b) => {
    if (a.date && !b.date) return -1;
    if (!a.date && b.date) return 1;
    const ka = `${a.date ?? ''} ${a.time ?? ''}`;
    const kb = `${b.date ?? ''} ${b.time ?? ''}`;
    if (ka !== kb) return ka < kb ? 1 : -1;
    return a.createdAt < b.createdAt ? 1 : -1;
  });
}

export function followUpKey(f: FollowUp): string {
  return `${f.dueDate} ${f.dueTime ?? '99:99'}`;
}

export function buildViews(ds: Dataset): Map<string, CustomerView> {
  const callsBy = new Map<string, CallLog[]>();
  for (const c of ds.calls) {
    const arr = callsBy.get(c.customerId);
    if (arr) arr.push(c);
    else callsBy.set(c.customerId, [c]);
  }
  const fuBy = new Map<string, FollowUp>();
  for (const f of ds.followUps) {
    if (f.status !== 'open') continue;
    const cur = fuBy.get(f.customerId);
    if (!cur || followUpKey(f) < followUpKey(cur)) fuBy.set(f.customerId, f);
  }
  const out = new Map<string, CustomerView>();
  for (const customer of ds.customers) {
    const calls = sortCalls(callsBy.get(customer.id) ?? []);
    out.set(customer.id, {
      customer,
      calls,
      lastCall: calls.find((c) => c.date) ?? null,
      lastNote: calls.find((c) => c.note.trim()) ?? null,
      nextFollowUp: fuBy.get(customer.id) ?? null,
    });
  }
  return out;
}

export interface Queues {
  overdue: CustomerView[];
  today: CustomerView[];
  upcoming: CustomerView[];
}

export function buildQueues(views: Map<string, CustomerView>, ref = today(), upcomingDays = 7): Queues {
  const q: Queues = { overdue: [], today: [], upcoming: [] };
  const limit = addDays(ref, upcomingDays);
  for (const v of views.values()) {
    const f = v.nextFollowUp;
    if (!f) continue;
    if (f.dueDate < ref) q.overdue.push(v);
    else if (f.dueDate === ref) q.today.push(v);
    else if (f.dueDate <= limit) q.upcoming.push(v);
  }
  const by = (a: CustomerView, b: CustomerView) =>
    followUpKey(a.nextFollowUp!) < followUpKey(b.nextFollowUp!) ? -1 : 1;
  q.overdue.sort(by);
  q.today.sort(by);
  q.upcoming.sort(by);
  return q;
}

/** Türkçe duyarlı küçük harf + aksan sadeleştirme (arama için). */
export function foldTr(s: string): string {
  return s
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/\s+/g, ' ')
    .trim();
}
