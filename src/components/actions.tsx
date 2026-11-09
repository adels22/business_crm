import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useStore } from '../data/store';
import { addDays, addMonths, formatDate, formatDateLong, nowTime, relativeDue, today } from '../domain/dates';
import { normalizePhone } from '../domain/phone';
import { PRODUCTS, RESULTS, STATUSES, type CallResult, type LocalDate, type Product, type Status } from '../domain/types';
import { Modal, PhoneLink, navigate } from './common';

interface Actions {
  logCall(customerId: string): void;
  postpone(followUpId: string): void;
  editCustomer(id?: string): void;
}
const Ctx = createContext<Actions | null>(null);
export const useActions = () => {
  const a = useContext(Ctx);
  if (!a) throw new Error('ActionsProvider eksik');
  return a;
};

export function ActionsProvider({ children }: { children: ReactNode }) {
  const [logFor, setLogFor] = useState<string | null>(null);
  const [postponeId, setPostponeId] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ id?: string } | null>(null);
  const actions = useMemo<Actions>(() => ({
    logCall: setLogFor,
    postpone: setPostponeId,
    editCustomer: (id) => setEdit({ id }),
  }), []);
  return (
    <Ctx.Provider value={actions}>
      {children}
      <Modal open={!!logFor} onClose={() => setLogFor(null)} title="Görüşme kaydet" labelledBy="log-title">
        {logFor && <LogCallForm customerId={logFor} onDone={() => setLogFor(null)} />}
      </Modal>
      <Modal open={!!postponeId} onClose={() => setPostponeId(null)} title="Takibi ertele" size="sm" labelledBy="pp-title">
        {postponeId && <PostponeForm followUpId={postponeId} onDone={() => setPostponeId(null)} />}
      </Modal>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Müşteriyi düzenle' : 'Yeni müşteri'} labelledBy="cust-title">
        {edit && <CustomerForm id={edit.id} onDone={() => setEdit(null)} />}
      </Modal>
    </Ctx.Provider>
  );
}

// ---------- Takip tarihi seçici (kısayollar + tarih/saat) ----------

const QUICK: { label: string; fn: (d: LocalDate) => LocalDate }[] = [
  { label: 'Yarın', fn: (d) => addDays(d, 1) },
  { label: '3 gün', fn: (d) => addDays(d, 3) },
  { label: '1 hafta', fn: (d) => addDays(d, 7) },
  { label: '2 hafta', fn: (d) => addDays(d, 14) },
  { label: '1 ay', fn: (d) => addMonths(d, 1) },
];

function DuePicker({ date, time, onChange, allowNone, idPrefix }: {
  date: LocalDate | null; time: string; onChange: (date: LocalDate | null, time: string) => void; allowNone?: boolean; idPrefix: string;
}) {
  const t = today();
  return (
    <div className="due-picker">
      <div className="chips" role="group" aria-label="Hızlı tarih">
        {allowNone && (
          <button type="button" className="chip" aria-pressed={date === null} onClick={() => onChange(null, '')}>Takip yok</button>
        )}
        {QUICK.map((q) => {
          const v = q.fn(t);
          return (
            <button key={q.label} type="button" className="chip" aria-pressed={date === v} onClick={() => onChange(v, time)}>
              {q.label}
            </button>
          );
        })}
      </div>
      <div className="row-fields">
        <label className="field">
          <span>Tarih</span>
          <input id={`${idPrefix}-date`} type="date" value={date ?? ''} onChange={(e) => onChange(e.target.value || null, time)} />
        </label>
        <label className="field field-time">
          <span>Saat <em>isteğe bağlı</em></span>
          <input type="time" value={time} disabled={!date} onChange={(e) => onChange(date, e.target.value)} />
        </label>
      </div>
      {date && <p className="hint">{relativeDue(date)}{date !== t ? `, ${formatDateLong(date)}` : ''}{time ? ` ${time}` : ''}</p>}
    </div>
  );
}

// ---------- Görüşme kaydet ----------

const SUGGEST_NEXT: Partial<Record<CallResult, (d: LocalDate) => LocalDate | null>> = {
  'Ulaşılamadı': (d) => addDays(d, 1),
  'Görüşüldü': (d) => addDays(d, 7),
  'Teklif iletildi': (d) => addDays(d, 3),
  'Müşteri oldu': () => null,
  'İlgilenmiyor': () => null,
};

function LogCallForm({ customerId, onDone }: { customerId: string; onDone: () => void }) {
  const { views, logCall, showToast } = useStore();
  const v = views.get(customerId);
  const [result, setResult] = useState<CallResult | null>(null);
  const [note, setNote] = useState('');
  const [editWhen, setEditWhen] = useState(false);
  const [date, setDate] = useState(today());
  const [time, setTime] = useState(nowTime());
  const [next, setNext] = useState<{ date: LocalDate | null; time: string; touched: boolean }>({ date: null, time: '', touched: false });
  const [updateStatus, setUpdateStatus] = useState(true);
  const [completeOpen, setCompleteOpen] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  if (!v) return null;
  const c = v.customer;
  const open = v.nextFollowUp;

  function pickResult(r: CallResult) {
    setResult(r);
    if (c.status === 'Müşteri oldu' && r !== 'Müşteri oldu') setUpdateStatus(false);
    if (!next.touched) {
      const s = SUGGEST_NEXT[r];
      setNext({ date: s ? s(today()) : null, time: '', touched: false });
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!result) { setError('Görüşmenin sonucunu seçin.'); return; }
    if (!date) { setError('Görüşme tarihini girin.'); return; }
    setSaving(true);
    try {
      await logCall({
        customerId, date, time: time || null, result, note, updateStatus, completeOpen: !!open && completeOpen,
        next: next.date ? { date: next.date, time: next.time || null } : null,
      });
      showToast(next.date ? `Görüşme kaydedildi. Sonraki takip: ${relativeDue(next.date)}` : 'Görüşme kaydedildi');
      onDone();
    } catch (err) {
      setError(`Görüşme kaydedilemedi: ${(err as Error).message}`);
      setSaving(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="log-who">
        <strong>{c.fullName}</strong>
        <PhoneLink customer={c} />
      </div>

      <fieldset className="field">
        <legend>Sonuç</legend>
        <div className="result-grid">
          {RESULTS.map((r, i) => (
            <label key={r} className="result-opt">
              <input type="radio" name="result" value={r} checked={result === r} autoFocus={i === 0}
                onChange={() => { pickResult(r); setError(''); }} />
              <span>{r}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="field">
        <span>Görüşme notu</span>
        <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ne konuşuldu, bir sonraki adım ne?" />
      </label>

      <div className="field">
        <span className="label">Görüşme zamanı</span>
        {editWhen ? (
          <div className="row-fields">
            <label className="field"><span>Tarih</span><input type="date" required value={date} max={today()} onChange={(e) => setDate(e.target.value)} /></label>
            <label className="field field-time"><span>Saat</span><input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
          </div>
        ) : (
          <p className="inline-value">
            Şimdi, {formatDateLong(date)} {time}
            <button type="button" className="link-btn" onClick={() => setEditWhen(true)}>Değiştir</button>
          </p>
        )}
      </div>

      <fieldset className="field">
        <legend>Sonraki takip</legend>
        <DuePicker idPrefix="next" allowNone date={next.date} time={next.time}
          onChange={(d, t) => setNext({ date: d, time: t, touched: true })} />
      </fieldset>

      <div className="checks">
        {result && result !== c.status && (
          <label className="check">
            <input type="checkbox" checked={updateStatus} onChange={(e) => setUpdateStatus(e.target.checked)} />
            <span>Müşteri durumunu "{result}" yap <em>şu an: {c.status}</em></span>
          </label>
        )}
        {open && (
          <label className="check">
            <input type="checkbox" checked={completeOpen} onChange={(e) => setCompleteOpen(e.target.checked)} />
            <span>{formatDate(open.dueDate)} tarihli takibi tamamla</span>
          </label>
        )}
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="button" className="btn" onClick={onDone}>Vazgeç</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>Görüşmeyi kaydet</button>
      </div>
    </form>
  );
}

// ---------- Ertele ----------

function PostponeForm({ followUpId, onDone }: { followUpId: string; onDone: () => void }) {
  const { data, postpone, showToast } = useStore();
  const f = data.followUps.find((x) => x.id === followUpId);
  const [date, setDate] = useState<LocalDate | null>(null);
  const [time, setTime] = useState(f?.dueTime ?? '');
  if (!f) return null;
  const c = data.customers.find((x) => x.id === f.customerId);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!date) return;
    await postpone(followUpId, date, time || null);
    showToast(`Takip ertelendi: ${relativeDue(date)}`);
    onDone();
  }
  return (
    <form className="form" onSubmit={submit}>
      <p className="muted">{c?.fullName}, şu anki takip: {formatDate(f.dueDate)}{f.dueTime ? ` ${f.dueTime}` : ''}
        {f.postponements.length > 0 && `, daha önce ${f.postponements.length} kez ertelendi`}</p>
      <DuePicker idPrefix="pp" date={date} time={time} onChange={(d, t) => { setDate(d); setTime(t); }} />
      <div className="form-actions">
        <button type="button" className="btn" onClick={onDone}>Vazgeç</button>
        <button type="submit" className="btn btn-primary" disabled={!date}>Ertele</button>
      </div>
    </form>
  );
}

// ---------- Müşteri formu ----------

function CustomerForm({ id, onDone }: { id?: string; onDone: () => void }) {
  const { data, views, saveCustomer, showToast, workspace } = useStore();
  const v = id ? views.get(id) : undefined;
  const c = v?.customer;
  const [fullName, setFullName] = useState(c?.fullName ?? '');
  const [phone, setPhone] = useState(c?.phone ?? '');
  const [region, setRegion] = useState(c?.region ?? '');
  const [sector, setSector] = useState(c?.sector ?? '');
  const [status, setStatus] = useState<Status>(c?.status ?? 'Yeni');
  const [products, setProducts] = useState<Product[]>(c?.products ?? []);
  const [fuDate, setFuDate] = useState<LocalDate | null>(v?.nextFollowUp?.dueDate ?? null);
  const [fuTime, setFuTime] = useState(v?.nextFollowUp?.dueTime ?? '');
  const [error, setError] = useState('');

  const regions = useMemo(() => [...new Set(data.customers.map((x) => x.region).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr')), [data.customers]);
  const sectors = useMemo(() => [...new Set(data.customers.map((x) => x.sector).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr')), [data.customers]);

  const norm = normalizePhone(phone);
  const dup = useMemo(
    () => (norm ? data.customers.find((x) => x.id !== id && x.phoneNorm === norm) ?? null : null),
    [norm, data.customers, id],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) { setError('İsim soyisim girin.'); return; }
    const saved = await saveCustomer({ fullName, phone, region, sector, status, products }, id,
      fuDate ? { date: fuDate, time: fuTime || null } : null);
    showToast(id ? 'Değişiklikler kaydedildi' : 'Müşteri eklendi');
    onDone();
    if (!id) navigate(`/musteri/${saved.id}`);
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      {workspace === 'demo' && <p className="notice-inline">Demo çalışma alanındasınız. Eklediğiniz kayıt demo verisi olarak saklanır.</p>}
      <label className="field">
        <span>İsim soyisim</span>
        <input required autoFocus value={fullName} onChange={(e) => { setFullName(e.target.value); setError(''); }} autoComplete="off" />
      </label>
      <label className="field">
        <span>Telefon numarası</span>
        <input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0532 123 45 67" autoComplete="off" />
        {dup && <span className="field-warn">Bu numara {dup.fullName} adına kayıtlı. Yine de kaydedebilirsiniz.</span>}
      </label>
      <div className="row-fields">
        <label className="field">
          <span>Bölge</span>
          <input list="regions" value={region} onChange={(e) => setRegion(e.target.value)} autoComplete="off" />
          <datalist id="regions">{regions.map((r) => <option key={r} value={r} />)}</datalist>
        </label>
        <label className="field">
          <span>Sektör</span>
          <input list="sectors" value={sector} onChange={(e) => setSector(e.target.value)} autoComplete="off" />
          <datalist id="sectors">{sectors.map((r) => <option key={r} value={r} />)}</datalist>
        </label>
      </div>
      <label className="field">
        <span>Müşteri durumu</span>
        <select value={status} onChange={(e) => setStatus(e.target.value as Status)}>
          {STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </label>
      <fieldset className="field">
        <legend>İlgilenilen ürün</legend>
        <div className="chips">
          {PRODUCTS.map((p) => (
            <label key={p} className="chip chip-check">
              <input type="checkbox" checked={products.includes(p)}
                onChange={(e) => setProducts(e.target.checked ? PRODUCTS.filter((x) => x === p || products.includes(x)) : products.filter((x) => x !== p))} />
              <span>{p}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="field">
        <legend>Takip arama</legend>
        <DuePicker idPrefix="cf" allowNone date={fuDate} time={fuTime} onChange={(d, t) => { setFuDate(d); setFuTime(t); }} />
        {c?.legacyFollowUpText && <p className="hint">Excel'deki takip ifadesi: "{c.legacyFollowUpText}"</p>}
      </fieldset>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="button" className="btn" onClick={onDone}>Vazgeç</button>
        <button type="submit" className="btn btn-primary">{id ? 'Değişiklikleri kaydet' : 'Müşteriyi ekle'}</button>
      </div>
    </form>
  );
}
