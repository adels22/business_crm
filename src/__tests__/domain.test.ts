import { describe, expect, it } from 'vitest';
import { parseTurkishDate, addMonths, relativeDue } from '../domain/dates';
import { normalizePhone, formatPhone } from '../domain/phone';
import { buildViews, buildQueues } from '../domain/derive';
import { csvToSheet, decodeText, parseCsv, detectDelimiter } from '../import/read';
import { autoMap, buildPreview, rowToRecords } from '../import/validate';
import type { Customer, Dataset } from '../domain/types';

describe('telefon', () => {
  it('farklı biçimleri aynı numaraya indirger', () => {
    for (const p of ['+90 532 123 45 67', '0532 123 45 67', '05321234567', '5321234567', '0090 532 123 4567', '(0532) 123-45-67'])
      expect(normalizePhone(p)).toBe('5321234567');
  });
  it('okunamayanları boş döner', () => {
    expect(normalizePhone('123')).toBe('');
    expect(normalizePhone('')).toBe('');
  });
  it('gösterim baştaki sıfırla', () => {
    expect(formatPhone('5321234567')).toBe('0532 123 45 67');
  });
});

describe('tarih', () => {
  it('gg.aa.yyyy ve saat', () => {
    expect(parseTurkishDate('03.04.2024')).toEqual({ ok: true, date: '2024-04-03', time: null });
    expect(parseTurkishDate('3/4/2024 14:30')).toEqual({ ok: true, date: '2024-04-03', time: '14:30' });
    expect(parseTurkishDate('2024-04-03')).toEqual({ ok: true, date: '2024-04-03', time: null });
  });
  it('belirsizleri uydurmaz', () => {
    expect(parseTurkishDate('03.04.24')).toMatchObject({ ok: false });
    expect(parseTurkishDate('31.02.2024')).toMatchObject({ ok: false });
    expect(parseTurkishDate('04/13/2024')).toMatchObject({ ok: false });
    expect(parseTurkishDate('geçen hafta')).toMatchObject({ ok: false });
    expect(parseTurkishDate('')).toBeNull();
  });
  it('ay ekleme ay sonunu taşırmaz', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
  });
  it('göreli takip', () => {
    expect(relativeDue('2026-11-06', '2026-11-09')).toBe('3 gün gecikti');
    expect(relativeDue('2026-11-09', '2026-11-09')).toBe('Bugün');
  });
});

describe('csv', () => {
  it('ayraç, tırnak ve satır sonu', () => {
    const t = 'İsim soyisim;Telefon numarası;Görüşme notu\r\n"Şükrü Öz";05321234567;"Not; ""tırnaklı""\nikinci satır"\r\n';
    expect(detectDelimiter(t)).toBe(';');
    const rows = parseCsv(t);
    expect(rows[1]).toEqual(['Şükrü Öz', '05321234567', 'Not; "tırnaklı"\nikinci satır']);
  });
  it('Windows-1254 çözer', () => {
    // "Çağrı" Windows-1254 baytları
    const bytes = new Uint8Array([0xc7, 0x61, 0xf0, 0x72, 0xfd]);
    expect(decodeText(bytes.buffer)).toBe('Çağrı');
  });
});

const existing: Customer = {
  id: 'x', fullName: 'Mevcut Kişi', phone: '0532 111 22 33', phoneNorm: '5321112233', region: '', sector: '',
  status: 'Yeni', products: [], source: 'import', createdAt: '', updatedAt: '',
};

describe('içe aktarma önizleme', () => {
  const csv = [
    'İsim soyisim;Telefon numarası;Bölge;Sektör;Son arama;Görüşme notu;Takip arama',
    'Ali Veli;05321234567;Kadıköy;Eğitim;01.10.2026;BES ile ilgilendi;15.11.2026 10:00',
    'Ali Veli Tekrar;+90 532 123 45 67;;;;;',
    'Kayıtlı;+905321112233;;;;;',
    ';0533 000 00 00;;;;not;',
    'Tarihsiz Not;0544 555 66 77;;;;eski not;ay sonu',
    'Belirsiz;0545 555 66 77;;;3.4.24;;',
    ';;;;;;',
  ].join('\n');
  const sheet = csvToSheet('t.csv', csv);
  const map = autoMap(sheet.headers);
  const rows = buildPreview(sheet, map, [existing], 'Yeni');

  it('başlıkları eşler', () => {
    expect(map).toMatchObject({ fullName: 0, phone: 1, region: 2, sector: 3, lastCall: 4, note: 5, followUp: 6, status: -1 });
  });
  it('boş satırı atlar', () => expect(rows).toHaveLength(6));
  it('telefonu metin olarak korur', () => {
    expect(rows[0].phone).toBe('05321234567');
    expect(rows[0].followUp).toEqual({ date: '2026-11-15', time: '10:00' });
  });
  it('tekrarları işaretler ve varsayılan atlar', () => {
    expect(rows[1].duplicate?.text).toMatch(/2\. satır/);
    expect(rows[1].include).toBe(false);
    expect(rows[2].duplicate?.text).toMatch(/zaten kayıtlı/);
  });
  it('isimsiz satır hata', () => {
    expect(rows[3].issues[0].level).toBe('error');
    expect(rows[3].include).toBe(false);
  });
  it('tarihsiz not ve okunamayan takip', () => {
    const r = rows[4];
    expect(r.include).toBe(true);
    expect(r.followUp).toBeNull();
    const rec = rowToRecords(r, 'b', () => Math.random().toString());
    expect(rec.calls[0]).toMatchObject({ date: null, note: 'eski not' });
    expect(rec.customer.legacyFollowUpText).toBe('ay sonu');
    expect(rec.followUps).toHaveLength(0);
  });
  it('iki haneli yıl tarih olarak atanmaz, ifade korunur', () => {
    const rec = rowToRecords(rows[5], 'b', () => Math.random().toString());
    expect(rec.calls[0]).toMatchObject({ date: null, rawDate: '3.4.24' });
  });
  it('aynı dosya ikinci kez: hepsi tekrar', () => {
    const added = rows.filter((r) => r.include).map((r) => rowToRecords(r, 'b', () => Math.random().toString()).customer);
    const again = buildPreview(sheet, map, [existing, ...added], 'Yeni');
    expect(again.filter((r) => r.include)).toHaveLength(0);
  });
});

describe('kuyruklar ve son arama', () => {
  it('son arama geçmişten hesaplanır, tarihsiz not sayılmaz', () => {
    const ds: Dataset = {
      customers: [{ ...existing }],
      calls: [
        { id: '1', customerId: 'x', date: null, time: null, result: null, note: 'eski', source: 'import', createdAt: '1' },
        { id: '2', customerId: 'x', date: '2026-11-01', time: '10:00', result: 'Görüşüldü', note: 'a', source: 'manual', createdAt: '2' },
        { id: '3', customerId: 'x', date: '2026-11-05', time: null, result: 'Ulaşılamadı', note: '', source: 'manual', createdAt: '3' },
      ],
      followUps: [{ id: 'f', customerId: 'x', dueDate: '2026-11-02', dueTime: null, status: 'open', postponements: [], source: 'manual', createdAt: '' }],
      imports: [],
    };
    const v = buildViews(ds).get('x')!;
    expect(v.lastCall?.id).toBe('3');
    expect(v.lastNote?.id).toBe('2');
    expect(v.calls.at(-1)?.id).toBe('1');
    expect(buildQueues(buildViews(ds), '2026-11-09').overdue).toHaveLength(1);
  });
});
