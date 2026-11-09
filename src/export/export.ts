import { buildViews, sortCalls } from '../domain/derive';
import { formatDate, today } from '../domain/dates';
import { formatPhone } from '../domain/phone';
import type { Dataset, Workspace } from '../domain/types';

export function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const fileBase = (ws: Workspace) => (ws === 'demo' ? `DEMO-musteriler-${today()}` : `musteriler-${today()}`);
const phoneOut = (c: { phone: string; phoneNorm: string }) => (c.phoneNorm ? formatPhone(c.phone, c.phoneNorm) : c.phone);
const dt = (d: string | null, t: string | null) => (d ? `${formatDate(d)}${t ? ' ' + t : ''}` : '');

/** Excel'deki yedi sütun aynı sırada + yeni sütunlar. */
export function customerRows(ds: Dataset) {
  const views = buildViews(ds);
  const header = ['İsim soyisim', 'Telefon numarası', 'Bölge', 'Sektör', 'Son arama', 'Görüşme notu', 'Takip arama', 'Müşteri durumu', 'İlgilenilen ürün', 'Kaynak'];
  const rows = [...views.values()]
    .sort((a, b) => a.customer.fullName.localeCompare(b.customer.fullName, 'tr'))
    .map((v) => [
      v.customer.fullName,
      phoneOut(v.customer),
      v.customer.region,
      v.customer.sector,
      v.lastCall ? dt(v.lastCall.date, v.lastCall.time) : '',
      v.lastNote?.note ?? '',
      v.nextFollowUp ? dt(v.nextFollowUp.dueDate, v.nextFollowUp.dueTime) : v.customer.legacyFollowUpText ?? '',
      v.customer.status,
      v.customer.products.join(', '),
      v.customer.source === 'demo' ? 'Demo' : v.customer.source === 'import' ? 'Excel aktarımı' : 'Elle eklendi',
    ]);
  return { header, rows };
}

export async function exportXlsx(ds: Dataset, ws: Workspace) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const names = new Map(ds.customers.map((c) => [c.id, c]));

  const { header, rows } = customerRows(ds);
  const s1 = wb.addWorksheet('Müşteriler');
  s1.addRow(header).font = { bold: true };
  for (const r of rows) s1.addRow(r);
  s1.getColumn(2).numFmt = '@'; // telefon metin
  s1.columns.forEach((c, i) => { c.width = [24, 18, 14, 16, 16, 50, 16, 18, 18, 14][i] ?? 16; });
  s1.views = [{ state: 'frozen', ySplit: 1 }];

  const s2 = wb.addWorksheet('Görüşmeler');
  s2.addRow(['İsim soyisim', 'Telefon numarası', 'Görüşme tarihi', 'Saat', 'Sonuç', 'Görüşme notu', 'Excel\'deki tarih ifadesi']).font = { bold: true };
  for (const c of sortCalls(ds.calls)) {
    const cu = names.get(c.customerId);
    s2.addRow([cu?.fullName ?? '', (cu ? phoneOut(cu) : ''), c.date ? formatDate(c.date) : 'Tarihi bilinmiyor', c.time ?? '', c.result ?? '', c.note, c.rawDate ?? '']);
  }
  s2.getColumn(2).numFmt = '@';
  s2.columns.forEach((c, i) => { c.width = [24, 18, 16, 8, 18, 60, 20][i] ?? 16; });

  const s3 = wb.addWorksheet('Takipler');
  s3.addRow(['İsim soyisim', 'Telefon numarası', 'Takip tarihi', 'Saat', 'Durum', 'Erteleme sayısı']).font = { bold: true };
  for (const f of [...ds.followUps].sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))) {
    const cu = names.get(f.customerId);
    s3.addRow([cu?.fullName ?? '', (cu ? phoneOut(cu) : ''), formatDate(f.dueDate), f.dueTime ?? '', f.status === 'open' ? 'Açık' : 'Tamamlandı', f.postponements.length]);
  }
  s3.getColumn(2).numFmt = '@';
  s3.columns.forEach((c, i) => { c.width = [24, 18, 14, 8, 12, 16][i] ?? 16; });

  const buf = await wb.xlsx.writeBuffer();
  download(`${fileBase(ws)}.xlsx`, new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
}

export function exportCsv(ds: Dataset, ws: Workspace) {
  const { header, rows } = customerRows(ds);
  const esc = (v: string) => (/[";\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  // Türkçe Excel ';' ayracı bekler; BOM ile UTF-8 olduğu anlaşılır.
  const text = '﻿' + [header, ...rows].map((r) => r.map((c) => esc(String(c))).join(';')).join('\r\n');
  download(`${fileBase(ws)}.csv`, new Blob([text], { type: 'text/csv;charset=utf-8' }));
}

// ---------- JSON yedek ----------

export const BACKUP_FORMAT = 'danisman-crm-yedek';

export function exportBackup(ds: Dataset, ws: Workspace) {
  const payload = { format: BACKUP_FORMAT, version: 1, workspace: ws, createdAt: new Date().toISOString(), data: ds };
  const name = ws === 'demo' ? `DEMO-yedek-${today()}.json` : `crm-yedek-${today()}.json`;
  download(name, new Blob([JSON.stringify(payload, null, 1)], { type: 'application/json' }));
}

export function parseBackup(text: string): { workspace: Workspace; createdAt: string; data: Dataset } {
  let p: unknown;
  try { p = JSON.parse(text); } catch { throw new Error('Dosya okunamadı: geçerli bir JSON değil.'); }
  const o = p as { format?: string; workspace?: Workspace; createdAt?: string; data?: Partial<Dataset> };
  if (o?.format !== BACKUP_FORMAT || !o.data) throw new Error('Bu dosya Danışman CRM yedeği değil.');
  const d = o.data;
  for (const k of ['customers', 'calls', 'followUps', 'imports'] as const) {
    if (!Array.isArray(d[k])) throw new Error(`Yedek eksik: "${k}" listesi yok.`);
  }
  return { workspace: o.workspace ?? 'main', createdAt: o.createdAt ?? '', data: d as Dataset };
}
