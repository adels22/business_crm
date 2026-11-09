import type { LocalDate, LocalTime } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

export function toLocalDate(d: Date): LocalDate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function toLocalTime(d: Date): LocalTime {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function today(): LocalDate {
  return toLocalDate(new Date());
}
export function nowTime(): LocalTime {
  return toLocalTime(new Date());
}

export function fromLocalDate(s: LocalDate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(s: LocalDate, days: number): LocalDate {
  const d = fromLocalDate(s);
  d.setDate(d.getDate() + days);
  return toLocalDate(d);
}
export function addMonths(s: LocalDate, months: number): LocalDate {
  const d = fromLocalDate(s);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toLocalDate(d);
}
/** b - a, gün olarak. */
export function daysBetween(a: LocalDate, b: LocalDate): number {
  return Math.round((fromLocalDate(b).getTime() - fromLocalDate(a).getTime()) / 86_400_000);
}

export function isValidYMD(y: number, m: number, d: number): boolean {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(y, m, 0).getDate();
}

export type ParsedDate =
  | { ok: true; date: LocalDate; time: LocalTime | null }
  | { ok: false; reason: string };

/**
 * Türkçe tarih okuma. Yalnızca kesin biçimleri kabul eder; tahmin yürütmez.
 *  - gg.aa.yyyy, gg/aa/yyyy, gg-aa-yyyy (gün başta), isteğe bağlı " SS:dd"
 *  - yyyy-aa-gg (ISO)
 */
export function parseTurkishDate(input: string): ParsedDate | null {
  const s = (input ?? '').trim().replace(/\s+/g, ' ');
  if (!s) return null;

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2})[:.](\d{2})(?::\d{2})?)?$/);
  let y: number, mo: number, d: number;
  let hh: string | undefined, mm: string | undefined;
  if (m) {
    [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    [hh, mm] = [m[4], m[5]];
  } else {
    m = s.match(/^(\d{1,2})([./-])(\d{1,2})\2(\d{2,4})(?: (\d{1,2})[:.](\d{2})(?::\d{2})?)?$/);
    if (!m) return { ok: false, reason: `"${s}" tarih olarak okunamadı` };
    if (m[4].length !== 4) {
      return { ok: false, reason: `"${s}": yıl dört haneli değil, hangi yıl olduğu belirsiz` };
    }
    [d, mo, y] = [Number(m[1]), Number(m[3]), Number(m[4])];
    [hh, mm] = [m[5], m[6]];
  }
  if (!isValidYMD(y, mo, d)) {
    if (mo > 12 && d <= 12) {
      return { ok: false, reason: `"${s}": ay 12'den büyük; ay/gün sırası belirsiz` };
    }
    return { ok: false, reason: `"${s}" geçerli bir tarih değil` };
  }
  let time: LocalTime | null = null;
  if (hh !== undefined && mm !== undefined) {
    const H = Number(hh);
    const M = Number(mm);
    if (H > 23 || M > 59) return { ok: false, reason: `"${s}": saat geçersiz` };
    // Excel'de saatsiz tarihler 00:00 olarak gelir; bunu saat bilgisi saymayız.
    if (!(H === 0 && M === 0)) time = `${pad(H)}:${pad(M)}`;
  }
  return { ok: true, date: `${y}-${pad(mo)}-${pad(d)}`, time };
}

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

/** 12.11.2026 */
export function formatDate(s: LocalDate | null | undefined): string {
  if (!s) return '';
  const [y, m, d] = s.split('-');
  return `${d}.${m}.${y}`;
}
/** 12 Kasım 2026 (yıl bu yılsa gizlenir) */
export function formatDateLong(s: LocalDate, withYear?: boolean): string {
  const d = fromLocalDate(s);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${withYear || !sameYear ? ' ' + d.getFullYear() : ''}`;
}
export function weekdayName(s: LocalDate): string {
  return DAYS[fromLocalDate(s).getDay()];
}

/** Takip için kısa göreli ifade. */
export function relativeDue(due: LocalDate, ref: LocalDate = today()): string {
  const diff = daysBetween(ref, due);
  if (diff === 0) return 'Bugün';
  if (diff === 1) return 'Yarın';
  if (diff === -1) return 'Dün';
  if (diff < 0) return `${-diff} gün gecikti`;
  if (diff < 7) return weekdayName(due);
  return formatDateLong(due);
}

/** Cümle içinde: "bugün", "dün", "3 gün önce", "2 Kasım". Ay adı büyük harfle kalır. */
export function pastPhrase(s: LocalDate, ref: LocalDate = today()): string {
  const r = relativePast(s, ref);
  return /^\d/.test(r) && !r.endsWith('önce') ? r : r.toLocaleLowerCase('tr');
}
export function duePhrase(s: LocalDate, ref: LocalDate = today()): string {
  const r = relativeDue(s, ref);
  return /^\d/.test(r) && !r.endsWith('gecikti') ? r : r.toLocaleLowerCase('tr');
}

/** Son arama gibi geçmiş tarihler için. */
export function relativePast(s: LocalDate, ref: LocalDate = today()): string {
  const diff = daysBetween(s, ref);
  if (diff === 0) return 'Bugün';
  if (diff === 1) return 'Dün';
  if (diff > 1 && diff < 7) return `${diff} gün önce`;
  return formatDateLong(s);
}
