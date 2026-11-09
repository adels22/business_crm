import { useActions } from '../components/actions';
import { DemoTag, EmptyState, Icon, PhoneLink, StatusBadge } from '../components/common';
import { useStore } from '../data/store';
import { formatDate, formatDateLong, pastPhrase, relativeDue, today, weekdayName } from '../domain/dates';

export function CustomerDetail({ id }: { id: string }) {
  const { views, data, complete, reopen, showToast } = useStore();
  const { logCall, postpone, editCustomer } = useActions();
  const v = views.get(id);
  if (!v) {
    return (
      <div className="page">
        <EmptyState title="Müşteri bulunamadı">
          <p>Kayıt silinmiş ya da başka bir çalışma alanında olabilir.</p>
          <a className="btn" href="#/musteriler">Müşteri listesine dön</a>
        </EmptyState>
      </div>
    );
  }
  const c = v.customer;
  const f = v.nextFollowUp;
  const t = today();
  const done = data.followUps
    .filter((x) => x.customerId === id && x.status === 'done')
    .sort((a, b) => ((a.completedAt ?? '') < (b.completedAt ?? '') ? 1 : -1))
    .slice(0, 5);
  const batch = c.importBatchId ? data.imports.find((b) => b.id === c.importBatchId) : undefined;

  async function onComplete() {
    if (!f) return;
    await complete(f.id);
    showToast('Takip tamamlandı', () => void reopen(f.id));
  }

  return (
    <div className="page detail">
      <a className="back" href="#/musteriler"><Icon name="back" size={16} />Müşteriler</a>
      <header className="detail-head">
        <div>
          <h1>{c.fullName} {c.source === 'demo' && <DemoTag />}</h1>
          <div className="detail-sub">
            <StatusBadge status={c.status} />
            {c.products.length > 0 && <span className="products">{c.products.join(', ')}</span>}
            <span className="muted">
              {v.lastCall ? `Son arama: ${formatDate(v.lastCall.date)}` : 'Henüz aranmadı'}
            </span>
          </div>
        </div>
        <div className="btn-row">
          <button className="btn btn-primary" onClick={() => logCall(c.id)}><Icon name="note" size={16} />Görüşme kaydet</button>
          <button className="btn" onClick={() => editCustomer(c.id)}>Düzenle</button>
        </div>
      </header>

      <div className="detail-grid">
        <aside className="detail-side">
          <section className="panel" aria-labelledby="h-contact">
            <h2 id="h-contact">İletişim</h2>
            <dl className="facts">
              <dt>Telefon</dt><dd><PhoneLink customer={c} className="phone-big" />
                {c.phone && !c.phoneNorm && <span className="field-warn">Numara Türkiye biçimine uymuyor; dosyadaki gibi saklandı.</span>}</dd>
              <dt>Bölge</dt><dd>{c.region || <span className="muted">Girilmemiş</span>}</dd>
              <dt>Sektör</dt><dd>{c.sector || <span className="muted">Girilmemiş</span>}</dd>
              <dt>Kaynak</dt><dd>{c.source === 'demo' ? 'Demo kaydı' : batch ? `${batch.fileName} (${formatDate(batch.importedAt.slice(0, 10))})` : c.source === 'import' ? 'Excel aktarımı' : 'Elle eklendi'}</dd>
            </dl>
          </section>

          <section className={`panel followup ${f && f.dueDate < t ? 'followup-late' : ''}`} aria-labelledby="h-fu">
            <h2 id="h-fu">Takip</h2>
            {f ? (
              <>
                <p className="fu-when">
                  <strong>{relativeDue(f.dueDate, t)}</strong>
                  <span>{relativeDue(f.dueDate, t) === formatDateLong(f.dueDate) ? weekdayName(f.dueDate) : `${weekdayName(f.dueDate)}, ${formatDateLong(f.dueDate)}`}{f.dueTime ? `, ${f.dueTime}` : ''}</span>
                </p>
                {f.postponements.length > 0 && (
                  <p className="muted small">{f.postponements.length} kez ertelendi. İlk plan: {formatDate(f.postponements[0].fromDate)}</p>
                )}
                <div className="btn-row">
                  <button className="btn btn-sm" onClick={onComplete}><Icon name="check" size={16} />Tamamla</button>
                  <button className="btn btn-sm" onClick={() => postpone(f.id)}>Ertele</button>
                </div>
              </>
            ) : (
              <>
                <p className="muted">Planlı takip yok.</p>
                <button className="btn btn-sm" onClick={() => editCustomer(c.id)}>Takip planla</button>
              </>
            )}
            {c.legacyFollowUpText && (
              <p className="legacy">Excel'deki takip ifadesi: "{c.legacyFollowUpText}". Tarih olarak okunamadığı için takip oluşturulmadı.</p>
            )}
            {done.length > 0 && (
              <details className="done-list">
                <summary>Tamamlanan takipler ({done.length})</summary>
                <ul>
                  {done.map((d) => (
                    <li key={d.id}>{formatDate(d.dueDate)}{d.dueTime ? ` ${d.dueTime}` : ''}
                      <span className="muted"> tamamlandı {d.completedAt ? formatDate(d.completedAt.slice(0, 10)) : ''}</span></li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        </aside>

        <section className="history" aria-labelledby="h-hist">
          <h2 id="h-hist">Görüşme geçmişi <span className="count">{v.calls.length}</span></h2>
          {v.calls.length === 0 ? (
            <EmptyState title="Henüz görüşme kaydı yok">
              <button className="btn btn-primary" onClick={() => logCall(c.id)}>İlk görüşmeyi kaydet</button>
            </EmptyState>
          ) : (
            <ol className="timeline">
              {v.calls.map((call) => (
                <li key={call.id} className="tl-item">
                  <div className="tl-when">
                    {call.date ? (
                      <>
                        <strong>{formatDate(call.date)}</strong>
                        <span>{call.time ?? ''}{call.time ? ', ' : ''}{pastPhrase(call.date, t)}</span>
                      </>
                    ) : (
                      <>
                        <strong>Tarihi bilinmiyor</strong>
                        {call.rawDate && <span>Excel'de: "{call.rawDate}"</span>}
                      </>
                    )}
                  </div>
                  <div className="tl-body">
                    <p className="tl-result">
                      {call.result ?? <span className="muted">Sonuç belirtilmemiş</span>}
                      {call.source === 'import' && <span className="tag">Excel'den aktarıldı</span>}
                    </p>
                    {call.note ? <p className="tl-note">{call.note}</p> : <p className="muted small">Not yok</p>}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
