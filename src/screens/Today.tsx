import { useMemo } from 'react';
import { useActions } from '../components/actions';
import { DemoTag, DueLabel, EmptyState, Icon, PhoneLink } from '../components/common';
import { useStore } from '../data/store';
import { buildQueues, type CustomerView } from '../domain/derive';
import { formatDateLong, pastPhrase, today, weekdayName } from '../domain/dates';

export function Today() {
  const { views, workspace, data } = useStore();
  const { editCustomer } = useActions();
  const t = today();
  const q = useMemo(() => buildQueues(views, t), [views, t]);
  const withoutFollowUp = useMemo(
    () => [...views.values()].filter((v) => !v.nextFollowUp && v.customer.status !== 'İlgilenmiyor').length,
    [views],
  );

  if (!data.customers.length) {
    return (
      <div className="page">
        <TodayHead t={t} />
        <EmptyState title="Henüz müşteri yok">
          <p>Excel listenizi aktarın ya da ilk müşteriyi elle ekleyin. Takip tarihi olan herkes burada sıraya girer.</p>
          <div className="btn-row">
            {workspace === 'main' && <a className="btn btn-primary" href="#/aktar">Excel listesini aktar</a>}
            <button className="btn" onClick={() => editCustomer()}>Müşteri ekle</button>
          </div>
        </EmptyState>
      </div>
    );
  }

  const total = q.overdue.length + q.today.length;
  return (
    <div className="page">
      <TodayHead t={t}>
        <p className="today-summary">
          {total === 0
            ? 'Bugün için bekleyen arama yok.'
            : `${total} arama bekliyor${q.overdue.length ? `, ${q.overdue.length} tanesi gecikmiş` : ''}.`}
        </p>
      </TodayHead>

      <Queue title="Geciken takipler" tone="late" items={q.overdue}
        empty="Geciken takip yok." />
      <Queue title="Bugün aranacaklar" items={q.today}
        empty="Bugün için planlanmış arama yok." />
      <Queue title="Önümüzdeki 7 gün" tone="soft" items={q.upcoming}
        empty="Önümüzdeki hafta için planlanmış takip yok." />

      {withoutFollowUp > 0 && (
        <p className="foot-note">
          {withoutFollowUp} müşterinin planlı takibi yok.{' '}
          <a href="#/musteriler?takip=yok">Bu müşterileri göster</a>
        </p>
      )}
    </div>
  );
}

function TodayHead({ t, children }: { t: string; children?: React.ReactNode }) {
  return (
    <header className="today-head">
      <h1>
        <span className="today-day">{weekdayName(t)}</span>
        <span className="today-date">{formatDateLong(t)}</span>
      </h1>
      {children}
    </header>
  );
}

function Queue({ title, items, empty, tone }: { title: string; items: CustomerView[]; empty: string; tone?: 'late' | 'soft' }) {
  const id = `q-${title.replace(/\s+/g, '-')}`;
  return (
    <section className={`queue ${tone ? `queue-${tone}` : ''}`} aria-labelledby={id}>
      <h2 id={id} className="queue-title">
        {title} <span className="count">{items.length}</span>
      </h2>
      {items.length === 0 ? (
        <p className="queue-empty">{empty}</p>
      ) : (
        <ul className="agenda">
          {items.map((v) => <AgendaRow key={v.customer.id} v={v} />)}
        </ul>
      )}
    </section>
  );
}

function AgendaRow({ v }: { v: CustomerView }) {
  const { logCall, postpone } = useActions();
  const c = v.customer;
  const f = v.nextFollowUp!;
  const summary = v.lastNote?.note;
  return (
    <li className="agenda-row">
      <DueLabel f={f} />
      <div className="agenda-who">
        <span className="name-line">
          <a className="name-link" href={`#/musteri/${c.id}`}>{c.fullName}</a>
          {c.source === 'demo' && <DemoTag />}
        </span>
        <span className="agenda-meta">
          {[c.region, c.sector].filter(Boolean).join(', ') || 'Bölge girilmemiş'}
          <span className="sep" aria-hidden="true" />
          {v.lastCall ? `Son arama ${pastPhrase(v.lastCall.date!)}` : 'Henüz aranmadı'}
        </span>
      </div>
      <PhoneLink customer={c} className="agenda-phone" />
      <p className="agenda-note" title={summary}>
        {summary ? summary : <span className="muted">Not yok</span>}
      </p>
      <div className="agenda-actions">
        <button className="btn btn-primary btn-sm" onClick={() => logCall(c.id)}>
          <Icon name="note" size={16} />Görüşme kaydet
        </button>
        <button className="btn btn-sm" onClick={() => postpone(f.id)}>Ertele</button>
      </div>
    </li>
  );
}
