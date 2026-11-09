import { foldTr } from '../domain/derive';
import { parseTurkishDate } from '../domain/dates';
import { normalizePhone } from '../domain/phone';
import { PRODUCTS, STATUSES, type CallLog, type Customer, type FollowUp, type LocalDate, type LocalTime, type Product, type Status } from '../domain/types';
import type { Cell, Sheet } from './read';

export const FIELDS = [
  { key: 'fullName', label: 'İsim soyisim', required: true, aliases: ['isim soyisim', 'ad soyad', 'adi soyadi', 'isim', 'musteri', 'musteri adi', 'ad'] },
  { key: 'phone', label: 'Telefon numarası', aliases: ['telefon numarasi', 'telefon', 'tel', 'cep', 'cep telefonu', 'gsm', 'numara', 'telefon no', 'tel no'] },
  { key: 'region', label: 'Bölge', aliases: ['bolge', 'il', 'ilce', 'sehir', 'semt'] },
  { key: 'sector', label: 'Sektör', aliases: ['sektor', 'meslek', 'is kolu'] },
  { key: 'lastCall', label: 'Son arama', aliases: ['son arama', 'son arama tarihi', 'son gorusme', 'arama tarihi'] },
  { key: 'note', label: 'Görüşme notu', aliases: ['gorusme notu', 'not', 'notlar', 'aciklama', 'gorusme'] },
  { key: 'followUp', label: 'Takip arama', aliases: ['takip arama', 'takip', 'takip tarihi', 'tekrar arama', 'geri arama'] },
  { key: 'status', label: 'Müşteri durumu', aliases: ['durum', 'musteri durumu'] },
  { key: 'products', label: 'İlgilenilen ürün', aliases: ['urun', 'urunler', 'ilgilenilen urun', 'ilgilendigi urun'] },
] as const;
export type FieldKey = (typeof FIELDS)[number]['key'];
/** Alan → sütun indeksi; -1 eşleşmemiş. */
export type Mapping = Record<FieldKey, number>;

export function autoMap(headers: string[]): Mapping {
  const folded = headers.map(foldTr);
  const m = {} as Mapping;
  const used = new Set<number>();
  for (const f of FIELDS) {
    let idx = -1;
    for (const alias of f.aliases) {
      idx = folded.findIndex((h, i) => !used.has(i) && h === alias);
      if (idx >= 0) break;
    }
    if (idx >= 0) used.add(idx);
    m[f.key] = idx;
  }
  return m;
}

export type IssueLevel = 'error' | 'warning';
export interface Issue { level: IssueLevel; text: string }

export interface PreviewRow {
  rowNumber: number;
  fullName: string;
  phone: string;
  phoneNorm: string;
  region: string;
  sector: string;
  status: Status;
  products: Product[];
  lastCall: { date: LocalDate | null; time: LocalTime | null; raw: string } | null;
  note: string;
  followUp: { date: LocalDate; time: LocalTime | null } | null;
  followUpRaw: string;
  issues: Issue[];
  duplicate: { text: string } | null;
  /** Varsayılan karar: hatasız ve tekrar olmayan satırlar eklenir. */
  include: boolean;
}

function readDate(cell: Cell | undefined): { date: LocalDate; time: LocalTime | null } | { error: string } | null {
  if (!cell) return null;
  if (cell.excelDate) return cell.excelDate;
  const p = parseTurkishDate(cell.text);
  if (!p) return null;
  return p.ok ? { date: p.date, time: p.time } : { error: p.reason };
}

function matchStatus(text: string): Status | null {
  const f = foldTr(text);
  return STATUSES.find((s) => foldTr(s) === f) ?? null;
}

function matchProducts(text: string): { products: Product[]; unknown: string[] } {
  const products: Product[] = [];
  const unknown: string[] = [];
  for (const tok of text.split(/[,;/+]|\bve\b/)) {
    const f = foldTr(tok);
    if (!f) continue;
    const p = PRODUCTS.find((x) => foldTr(x) === f || (x === 'Sağlık' && f.startsWith('saglik')) || (x === 'Hayat' && f.startsWith('hayat')));
    if (p) { if (!products.includes(p)) products.push(p); } else unknown.push(tok.trim());
  }
  return { products, unknown };
}

export function buildPreview(
  sheet: Sheet,
  mapping: Mapping,
  existing: Customer[],
  defaultStatus: Status,
): PreviewRow[] {
  const byPhone = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const c of existing) {
    if (c.phoneNorm) byPhone.set(c.phoneNorm, c.fullName);
    byName.set(foldTr(c.fullName), c.fullName);
  }
  const filePhones = new Map<string, number>();
  const fileNames = new Map<string, number>();
  const out: PreviewRow[] = [];

  for (const { rowNumber, cells } of sheet.rows) {
    const get = (k: FieldKey) => (mapping[k] >= 0 ? cells[mapping[k]] : undefined);
    const text = (k: FieldKey) => (get(k)?.text ?? '').replace(/\s+/g, ' ').trim();
    const mappedCells = Object.values(mapping).filter((i) => i >= 0).map((i) => cells[i]?.text ?? '');
    if (!mappedCells.some((t) => t.trim())) continue; // tamamen boş satır

    const issues: Issue[] = [];
    const fullName = text('fullName');
    if (!fullName) issues.push({ level: 'error', text: 'İsim soyisim boş; satır aktarılamaz.' });

    const phone = text('phone');
    const phoneNorm = normalizePhone(phone);
    if (!phone) issues.push({ level: 'warning', text: 'Telefon numarası yok.' });
    else if (!phoneNorm) issues.push({ level: 'warning', text: `"${phone}" geçerli bir Türkiye numarasına benzemiyor; yazıldığı gibi saklanacak.` });

    let lastCall: PreviewRow['lastCall'] = null;
    const lcRaw = text('lastCall');
    const lc = readDate(get('lastCall'));
    if (lc && 'error' in lc) {
      issues.push({ level: 'warning', text: `Son arama: ${lc.error}. Tarih atanmayacak; orijinal ifade görüşme geçmişinde saklanacak.` });
      lastCall = { date: null, time: null, raw: lcRaw };
    } else if (lc) lastCall = { ...lc, raw: lcRaw };

    const note = (get('note')?.text ?? '').trim();
    if (note && !lastCall) issues.push({ level: 'warning', text: 'Görüşme notunun tarihi yok; "tarihi bilinmiyor" olarak saklanacak.' });

    let followUp: PreviewRow['followUp'] = null;
    const followUpRaw = text('followUp');
    const fu = readDate(get('followUp'));
    if (fu && 'error' in fu) issues.push({ level: 'warning', text: `Takip arama: ${fu.error}. Takip oluşturulmayacak, ifade müşteri kaydında görünecek.` });
    else if (fu) followUp = fu;

    let status = defaultStatus;
    const st = text('status');
    if (st) {
      const m = matchStatus(st);
      if (m) status = m;
      else issues.push({ level: 'warning', text: `"${st}" bilinen bir durum değil; "${defaultStatus}" kullanılacak.` });
    }

    let products: Product[] = [];
    const pr = text('products');
    if (pr) {
      const r = matchProducts(pr);
      products = r.products;
      if (r.unknown.length) issues.push({ level: 'warning', text: `Tanınmayan ürün: ${r.unknown.join(', ')}.` });
    }

    let duplicate: PreviewRow['duplicate'] = null;
    if (phoneNorm) {
      if (byPhone.has(phoneNorm)) duplicate = { text: `Bu telefon zaten kayıtlı: ${byPhone.get(phoneNorm)}` };
      else if (filePhones.has(phoneNorm)) duplicate = { text: `Dosyada ${filePhones.get(phoneNorm)}. satırla aynı telefon` };
      else filePhones.set(phoneNorm, rowNumber);
    } else if (fullName) {
      const fn = foldTr(fullName);
      if (byName.has(fn)) duplicate = { text: `Telefonsuz kayıt; aynı isim zaten kayıtlı: ${byName.get(fn)}` };
      else if (fileNames.has(fn)) duplicate = { text: `Telefonsuz kayıt; dosyada ${fileNames.get(fn)}. satırla aynı isim` };
      else fileNames.set(fn, rowNumber);
    }

    const hasError = issues.some((i) => i.level === 'error');
    out.push({
      rowNumber, fullName, phone, phoneNorm, region: text('region'), sector: text('sector'),
      status, products, lastCall, note, followUp, followUpRaw: fu && 'error' in fu ? followUpRaw : '',
      issues, duplicate, include: !hasError && !duplicate,
    });
  }
  return out;
}

export function rowToRecords(r: PreviewRow, batchId: string, newId: () => string) {
  const now = new Date().toISOString();
  const id = newId();
  const customer: Customer = {
    id, fullName: r.fullName, phone: r.phone, phoneNorm: r.phoneNorm, region: r.region, sector: r.sector,
    status: r.status, products: r.products, source: 'import', importBatchId: batchId,
    createdAt: now, updatedAt: now,
    ...(r.followUpRaw ? { legacyFollowUpText: r.followUpRaw } : {}),
  };
  const calls: CallLog[] = [];
  if (r.lastCall || r.note) {
    calls.push({
      id: newId(), customerId: id, date: r.lastCall?.date ?? null, time: r.lastCall?.time ?? null,
      result: null, note: r.note, source: 'import', createdAt: now,
      ...(r.lastCall && !r.lastCall.date && r.lastCall.raw ? { rawDate: r.lastCall.raw } : {}),
    });
  }
  const followUps: FollowUp[] = r.followUp
    ? [{ id: newId(), customerId: id, dueDate: r.followUp.date, dueTime: r.followUp.time, status: 'open',
        postponements: [], source: 'import', createdAt: now }]
    : [];
  return { customer, calls, followUps };
}
