import { useEffect, useMemo, useRef, useState } from 'react';
import { useActions } from '../components/actions';
import { DemoTag, EmptyState, Icon, PhoneLink, StatusBadge, navigate } from '../components/common';
import { useStore } from '../data/store';
import { foldTr, followUpKey, type CustomerView } from '../domain/derive';
import { addDays, duePhrase, formatDate, pastPhrase, today } from '../domain/dates';
import { normalizePhone } from '../domain/phone';
import { PRODUCTS, STATUSES } from '../domain/types';

type FollowFilter = '' | 'gecikmis' | 'bugun' | 'hafta' | 'var' | 'yok';
interface Filters { q: string; region: string; sector: string; status: string; product: string; follow: FollowFilter }
type SortKey = 'name' | 'region' | 'sector' | 'status' | 'last' | 'follow';
const EMPTY: Filters = { q: '', region: '', sector: '', status: '', product: '', follow: '' };

// Sayfalar arasında gidip gelince filtreler kaybolmasın.
let memo: { f: Filters; sort: SortKey; dir: 1 | -1 } = { f: EMPTY, sort: 'follow', dir: 1 };

const PAGE = 150;

export function Customers({ query }: { query: URLSearchParams }) {
  const { views, data } = useStore();
  const { editCustomer, logCall } = useActions();
  const [f, setF] = useState<Filters>(() => {
    const t = query.get('takip') as FollowFilter | null;
    return t ? { ...EMPTY, follow: t } : memo.f;
  });
  const [sort, setSort] = useState<SortKey>(memo.sort);
  const [dir, setDir] = useState<1 | -1>(memo.dir);
  const [limit, setLimit] = useState(PAGE);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => { memo = { f, sort, dir }; }, [f, sort, dir]);
  useEffect(() => setLimit(PAGE), [f, sort, dir]);

  // "/" ile aramaya odaklan
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) && !document.querySelector('dialog[open]')) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  const uniq = (k: 'region' | 'sector') =>
    [...new Set(data.customers.map((c) => c[k]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
  const regions = useMemo(() => uniq('region'), [data.customers]); // eslint-disable-line react-hooks/exhaustive-deps
  const sectors = useMemo(() => uniq('sector'), [data.customers]); // eslint-disable-line react-hooks/exhaustive-deps

  const t = today();
  const rows = useMemo(() => {
    const qText = foldTr(f.q);
    const qDigits = f.q.replace(/\D/g, '');
    const qNorm = normalizePhone(f.q);
    const weekEnd = addDays(t, 7);
    const list = [...views.values()].filter((v) => {
      const c = v.customer;
      if (qText) {
        const nameHit = foldTr(c.fullName).includes(qText);
        const phoneHit = qDigits.length >= 3 && (
          (qNorm && c.phoneNorm === qNorm) ||
          c.phone.replace(/\D/g, '').includes(qDigits) ||
          (c.phoneNorm && ('0' + c.phoneNorm).includes(qDigits))
        );
        if (!nameHit && !phoneHit) return false;
      }
      if (f.region && c.region !== f.region) return false;
      if (f.sector && c.sector !== f.sector) return false;
      if (f.status && c.status !== f.status) return false;
      if (f.product && !c.products.includes(f.product as never)) return false;
      const d = v.nextFollowUp?.dueDate;
      switch (f.follow) {
        case 'gecikmis': if (!d || d >= t) return false; break;
        case 'bugun': if (d !== t) return false; break;
        case 'hafta': if (!d || d < t || d > weekEnd) return false; break;
        case 'var': if (!d) return false; break;
        case 'yok': if (d) return false; break;
      }
      return true;
    });
    const cmp: Record<SortKey, (a: CustomerView, b: CustomerView) => number> = {
      name: (a, b) => a.customer.fullName.localeCompare(b.customer.fullName, 'tr'),
      region: (a, b) => strCmp(a.customer.region, b.customer.region),
      sector: (a, b) => strCmp(a.customer.sector, b.customer.sector),
      status: (a, b) => STATUSES.indexOf(a.customer.status) - STATUSES.indexOf(b.customer.status),
      last: (a, b) => strCmp(lastKey(a), lastKey(b)),
      follow: (a, b) => strCmp(a.nextFollowUp ? followUpKey(a.nextFollowUp) : '', b.nextFollowUp ? followUpKey(b.nextFollowUp) : ''),
    };
    return list.sort((a, b) => cmp[sort](a, b) * dir || a.customer.fullName.localeCompare(b.customer.fullName, 'tr'));
  }, [views, f, sort, dir, t]);

  const active = Object.values(f).some(Boolean);
  const set = (k: keyof Filters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  function sortBy(k: SortKey) {
    if (sort === k) setDir(dir === 1 ? -1 : 1);
    else { setSort(k); setDir(1); }
  }
  const Th = ({ k, children, className }: { k: SortKey; children: string; className?: string }) => (
    <th className={className} aria-sort={sort === k ? (dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="th-btn" onClick={() => sortBy(k)}>
        {children}
        <span className="sort-ind" aria-hidden="true">{sort === k ? (dir === 1 ? '▲' : '▼') : ''}</span>
      </button>
    </th>
  );

  return (
    <div className="page page-wide">
      <header className="page-head">
        <h1>Müşteriler</h1>
        <button className="btn btn-primary" onClick={() => editCustomer()}><Icon name="plus" size={16} />Yeni müşteri</button>
      </header>

      <div className="filters" role="search">
        <label className="search">
          <Icon name="search" />
          <span className="sr-only">İsim ya da telefonla ara</span>
          <input ref={searchRef} type="search" placeholder="İsim ya da telefon ara" value={f.q} onChange={set('q')} />
          <kbd aria-hidden="true">/</kbd>
        </label>
        <Select label="Bölge" value={f.region} onChange={set('region')} options={regions} />
        <Select label="Sektör" value={f.sector} onChange={set('sector')} options={sectors} />
        <Select label="Durum" value={f.status} onChange={set('status')} options={[...STATUSES]} />
        <Select label="Ürün" value={f.product} onChange={set('product')} options={[...PRODUCTS]} />
        <label className="filter">
          <span className="sr-only">Takip</span>
          <select value={f.follow} onChange={set('follow')} data-active={!!f.follow}>
            <option value="">Takip: tümü</option>
            <option value="gecikmis">Gecikmiş takip</option>
            <option value="bugun">Takibi bugün</option>
            <option value="hafta">Takibi 7 gün içinde</option>
            <option value="var">Takibi olan</option>
            <option value="yok">Takibi olmayan</option>
          </select>
        </label>
        {active && <button className="link-btn" onClick={() => setF(EMPTY)}>Filtreleri temizle</button>}
      </div>

      <p className="result-count" aria-live="polite">
        {rows.length === data.customers.length ? `${rows.length} müşteri` : `${rows.length} / ${data.customers.length} müşteri`}
      </p>

      {rows.length === 0 ? (
        data.customers.length === 0 ? (
          <EmptyState title="Henüz müşteri yok">
            <p>Excel listenizi aktararak ya da tek tek ekleyerek başlayın.</p>
            <div className="btn-row">
              <a className="btn btn-primary" href="#/aktar">Excel listesini aktar</a>
              <button className="btn" onClick={() => editCustomer()}>Müşteri ekle</button>
            </div>
          </EmptyState>
        ) : (
          <EmptyState title="Bu filtrelere uyan müşteri yok">
            <button className="btn" onClick={() => setF(EMPTY)}>Filtreleri temizle</button>
          </EmptyState>
        )
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <Th k="name">İsim soyisim</Th>
                  <th>Telefon</th>
                  <Th k="region">Bölge</Th>
                  <Th k="sector">Sektör</Th>
                  <Th k="status">Durum ve ürün</Th>
                  <Th k="last">Son arama</Th>
                  <th className="col-note">Son görüşme notu</th>
                  <Th k="follow">Takip</Th>
                  <th><span className="sr-only">İşlem</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, limit).map((v) => {
                  const c = v.customer;
                  const fu = v.nextFollowUp;
                  return (
                    <tr key={c.id} onClick={(e) => { if (!(e.target as HTMLElement).closest('a,button')) navigate(`/musteri/${c.id}`); }}>
                      <td className="cell-name">
                        <a className="name-link" href={`#/musteri/${c.id}`}>{c.fullName}</a>
                        {c.source === 'demo' && <DemoTag />}
                      </td>
                      <td className="nowrap"><PhoneLink customer={c} /></td>
                      <td>{c.region}</td>
                      <td>{c.sector}</td>
                      <td>
                        <StatusBadge status={c.status} />
                        {c.products.length > 0 && <span className="cell-products">{c.products.join(', ')}</span>}
                      </td>
                      <td className="nowrap num">{v.lastCall ? formatDate(v.lastCall.date) : <span className="muted">Yok</span>}</td>
                      <td className="col-note"><span className="clamp" title={v.lastNote?.note}>{v.lastNote?.note}</span></td>
                      <td className={`nowrap num ${fu && fu.dueDate < t ? 'text-late' : ''}`}>
                        {fu ? <>{formatDate(fu.dueDate)}{fu.dueTime && <span className="muted block">{fu.dueTime}</span>}</> : <span className="muted">Yok</span>}
                      </td>
                      <td><button className="btn btn-sm btn-quiet" onClick={() => logCall(c.id)} aria-label={`${c.fullName} için görüşme kaydet`}>Görüşme</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <ul className="card-list">
            {rows.slice(0, limit).map((v) => {
              const c = v.customer;
              const fu = v.nextFollowUp;
              return (
                <li key={c.id} className="list-row">
                  <div className="list-top">
                    <a className="name-link" href={`#/musteri/${c.id}`}>{c.fullName}</a>
                    {c.source === 'demo' && <DemoTag />}
                    <StatusBadge status={c.status} />
                  </div>
                  <div className="list-mid">
                    <PhoneLink customer={c} className="phone-big" />
                    <button className="btn btn-sm" onClick={() => logCall(c.id)}>Görüşme kaydet</button>
                  </div>
                  <p className="list-meta">
                    {[c.region, c.sector, c.products.join(', ')].filter(Boolean).join(', ')}
                  </p>
                  <p className="list-meta">
                    {v.lastCall ? `Son arama ${pastPhrase(v.lastCall.date!)}` : 'Henüz aranmadı'}
                    {fu && <>. Takip: <span className={fu.dueDate < t ? 'text-late' : ''}>{duePhrase(fu.dueDate, t)}</span></>}
                  </p>
                </li>
              );
            })}
          </ul>
          {rows.length > limit && (
            <div className="more">
              <button className="btn" onClick={() => setLimit(limit + PAGE)}>{Math.min(PAGE, rows.length - limit)} müşteri daha göster</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function strCmp(a: string, b: string) {
  if (!a && b) return 1;
  if (a && !b) return -1;
  return a.localeCompare(b, 'tr');
}
function lastKey(v: CustomerView) {
  return v.lastCall ? `${v.lastCall.date} ${v.lastCall.time ?? ''}` : '';
}

function Select({ label, value, onChange, options }: {
  label: string; value: string; onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void; options: string[];
}) {
  return (
    <label className="filter">
      <span className="sr-only">{label}</span>
      <select value={value} onChange={onChange} data-active={!!value}>
        <option value="">{label}: tümü</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}
