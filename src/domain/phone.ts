/**
 * Türkiye telefon numarası karşılaştırma biçimi: 10 hane, baştaki 0 ve +90 olmadan.
 * "+90 532 123 45 67", "0532 123 45 67", "05321234567", "5321234567",
 * "0090 532…" hepsi "5321234567" olur. Okunamazsa '' döner.
 */
export function normalizePhone(input: string): string {
  let d = (input ?? '').replace(/\D+/g, '');
  if (d.startsWith('0090')) d = d.slice(4);
  else if (d.length === 12 && d.startsWith('90')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d.length === 10 && /^[2-5]/.test(d) ? d : '';
}

/** Ekranda gösterim: 0532 123 45 67. Okunamazsa kullanıcının yazdığı metin. */
export function formatPhone(raw: string, norm?: string): string {
  const n = norm ?? normalizePhone(raw);
  if (!n) return raw;
  return `0${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6, 8)} ${n.slice(8)}`;
}

/** tel: bağlantısı. Okunamayan numarada yalnızca rakamları kullanır. */
export function telHref(raw: string, norm?: string): string | null {
  const n = norm ?? normalizePhone(raw);
  if (n) return `tel:+90${n}`;
  const digits = raw.replace(/[^\d+]/g, '');
  return digits.length >= 7 ? `tel:${digits}` : null;
}
