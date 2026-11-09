/**
 * .xlsx ve .csv okuma. Her hücre metin olarak döner; Excel'in tarih hücreleri ayrıca
 * kesin tarih olarak taşınır. Telefonlar asla sayıya çevrilmez.
 */
import type { LocalDate, LocalTime } from '../domain/types';

export interface Cell {
  text: string;
  /** Yalnızca Excel'de tarih biçimli hücreler için. */
  excelDate?: { date: LocalDate; time: LocalTime | null };
}

export interface Sheet {
  name: string;
  headers: string[];
  /** Başlık satırından sonraki satırlar; rowNumber dosyadaki satır numarasıdır. */
  rows: { rowNumber: number; cells: Cell[] }[];
}

const pad = (n: number) => String(n).padStart(2, '0');

// ---------- CSV ----------

export function decodeText(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  try {
    const t = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return t.replace(/^﻿/, '');
  } catch {
    // Türkçe Excel'in "CSV (virgülle ayrılmış)" çıktısı genelde Windows-1254 olur.
    return new TextDecoder('windows-1254').decode(bytes);
  }
}

export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim()) ?? '';
  const counts = [';', ',', '\t'].map((d) => [d, countOutsideQuotes(firstLine, d)] as const);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ';';
}

function countOutsideQuotes(line: string, d: string): number {
  let n = 0;
  let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (!q && ch === d) n++;
  }
  return n;
}

export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else q = false;
      } else field += ch;
    } else if (ch === '"' && field === '') q = true;
    else if (ch === delimiter) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function toSheet(name: string, grid: { rowNumber: number; cells: Cell[] }[]): Sheet {
  const nonEmpty = grid.filter((r) => r.cells.some((c) => c.text.trim()));
  const [head, ...rest] = nonEmpty;
  const headers = (head?.cells ?? []).map((c, i) => c.text.trim() || `Sütun ${i + 1}`);
  return { name, headers, rows: rest };
}

export function csvToSheet(name: string, text: string): Sheet {
  const grid = parseCsv(text).map((cells, i) => ({ rowNumber: i + 1, cells: cells.map((t) => ({ text: t })) }));
  return toSheet(name, grid);
}

// ---------- XLSX ----------

/* eslint-disable @typescript-eslint/no-explicit-any */
function cellFrom(cell: any): Cell {
  const v = cell?.value;
  if (v === null || v === undefined) return { text: '' };
  if (v instanceof Date) {
    // ExcelJS seri tarihi UTC olarak verir; UTC alanları dosyadaki değerin aynısıdır.
    const date = `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
    const H = v.getUTCHours();
    const M = v.getUTCMinutes();
    const time = H || M ? `${pad(H)}:${pad(M)}` : null;
    return { text: String(cell.text ?? ''), excelDate: { date, time } };
  }
  if (typeof v === 'number') {
    // Telefon gibi uzun tamsayılar: bilimsel gösterime düşmesin.
    let t = Number.isInteger(v) ? v.toFixed(0) : String(v);
    // "00000000000" gibi biçimle baştaki sıfırı gösteren hücreler
    const fmt: string = cell.numFmt ?? '';
    if (Number.isInteger(v) && /^0+$/.test(fmt) && t.length < fmt.length) t = t.padStart(fmt.length, '0');
    return { text: t };
  }
  if (typeof v === 'object') {
    if ('richText' in v) return { text: v.richText.map((r: any) => r.text).join('') };
    if ('text' in v) return { text: String(v.text) };
    if ('result' in v) return cellFrom({ value: v.result, numFmt: cell.numFmt, text: cell.text });
    if ('error' in v) return { text: '' };
  }
  return { text: String(v) };
}

export async function readXlsx(buf: ArrayBuffer): Promise<Sheet[]> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const sheets: Sheet[] = [];
  wb.eachSheet((ws: any) => {
    const grid: { rowNumber: number; cells: Cell[] }[] = [];
    const width = ws.columnCount;
    ws.eachRow({ includeEmpty: false }, (row: any, rowNumber: number) => {
      const cells: Cell[] = [];
      for (let c = 1; c <= width; c++) cells.push(cellFrom(row.getCell(c)));
      grid.push({ rowNumber, cells });
    });
    sheets.push(toSheet(ws.name, grid));
  });
  return sheets;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function readFile(file: File): Promise<Sheet[]> {
  const buf = await file.arrayBuffer();
  const lower = file.name.toLocaleLowerCase('tr');
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) return [csvToSheet(file.name, decodeText(buf))];
  if (lower.endsWith('.xlsx')) return readXlsx(buf);
  if (lower.endsWith('.xls')) {
    throw new Error('Eski .xls biçimi okunamıyor. Dosyayı Excel\'de açıp "Farklı kaydet > Excel Çalışma Kitabı (.xlsx)" ile kaydedin.');
  }
  throw new Error('Yalnızca .xlsx ve .csv dosyaları aktarılabilir.');
}
