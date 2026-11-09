import { useMemo, useState } from 'react';
import { EmptyState, Icon } from '../components/common';
import { newId } from '../data/db';
import { useStore } from '../data/store';
import { formatDate } from '../domain/dates';
import { formatPhone } from '../domain/phone';
import { STATUSES, type Status } from '../domain/types';
import { readFile, type Sheet } from '../import/read';
import { FIELDS, autoMap, buildPreview, rowToRecords, type FieldKey, type Mapping, type PreviewRow } from '../import/validate';

type Step = 1 | 2 | 3 | 4;
const STEPS = ['Dosya seç', 'Sütunları eşleştir', 'Önizle ve kontrol et', 'Sonuç'];
type View = 'all' | 'issues' | 'dup' | 'error';

export function Import() {
  const { workspace, switchWorkspace, data, commitImport, showToast } = useStore();
  const [step, setStep] = useState<Step>(1);
  const [fileName, setFileName] = useState('');
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [defaultStatus, setDefaultStatus] = useState<Status>('Yeni');
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [view, setView] = useState<View>('all');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ added: number; skipped: number } | null>(null);

  const sheet = sheets[sheetIdx];

  if (workspace === 'demo') {
    return (
      <div className="page">
        <header className="page-head"><h1>Excel aktarımı</h1></header>
        <EmptyState title="Aktarım yalnızca kendi verilerinize yapılır">
          <p>Şu an demo çalışma alanındasınız. Gerçek listenizin demo kayıtlarla karışmaması için önce kendi çalışma alanınıza geçin.</p>
          <button className="btn btn-primary" onClick={() => switchWorkspace('main')}>Kendi verilerime geç</button>
        </EmptyState>
      </div>
    );
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      const s = await readFile(file);
      const usable = s.filter((x) => x.rows.length > 0);
      if (!usable.length) throw new Error('Dosyada başlık satırından sonra veri bulunamadı.');
      const best = usable.reduce((a, b) => (b.rows.length > a.rows.length ? b : a));
      setFileName(file.name);
      setSheets(usable);
      setSheetIdx(usable.indexOf(best));
      setMapping(autoMap(best.headers));
      setStep(2);
    } catch (e) {
      setError((e as Error).message || 'Dosya okunamadı.');
    } finally {
      setBusy(false);
    }
  }

  function chooseSheet(i: number) {
    setSheetIdx(i);
    setMapping(autoMap(sheets[i].headers));
  }

  function toPreview() {
    if (!mapping || mapping.fullName < 0) { setError('"İsim soyisim" alanı için bir sütun seçin.'); return; }
    setError('');
    setRows(buildPreview(sheet, mapping, data.customers, defaultStatus));
    setView('all');
    setStep(3);
  }

  async function commit() {
    const chosen = rows.filter((r) => r.include);
    setBusy(true);
    try {
      const batchId = newId();
      await commitImport(
        { id: batchId, fileName, importedAt: new Date().toISOString(), added: chosen.length, skipped: rows.length - chosen.length },
        chosen.map((r) => rowToRecords(r, batchId, newId)),
      );
      setResult({ added: chosen.length, skipped: rows.length - chosen.length });
      setStep(4);
      showToast(`${chosen.length} müşteri aktarıldı`);
    } catch (e) {
      setError(`Aktarım kaydedilemedi, hiçbir kayıt eklenmedi: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStep(1); setSheets([]); setRows([]); setMapping(null); setResult(null); setError(''); setFileName('');
  }

  return (
    <div className="page page-wide">
      <header className="page-head"><h1>Excel aktarımı</h1></header>
      <ol className="steps" aria-label="Aktarım adımları">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={step === i + 1 ? 'step' : undefined} className={step > i + 1 ? 'done' : ''}>
            <span className="step-n">{i + 1}</span>{s}
          </li>
        ))}
      </ol>

      {error && <p className="form-error" role="alert">{error}</p>}

      {step === 1 && (
        <section className="import-pick">
          <label className={`drop ${busy ? 'busy' : ''}`}>
            <input type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => onFile(e.target.files?.[0])} disabled={busy} />
            <Icon name="import" size={28} />
            <strong>{busy ? 'Dosya okunuyor' : 'Excel ya da CSV dosyası seçin'}</strong>
            <span className="muted">.xlsx veya .csv. Dosya bu cihazda okunur, hiçbir yere gönderilmez.</span>
          </label>
          <div className="import-rules">
            <h2>Aktarırken neler olur</h2>
            <ul>
              <li>İlk dolu satır başlık sayılır. "İsim soyisim", "Telefon numarası", "Bölge", "Sektör", "Son arama", "Görüşme notu", "Takip arama" otomatik eşleşir.</li>
              <li>Telefonlar metin olarak saklanır, baştaki sıfır korunur. +90, 0 ve boşluklu yazımlar aynı numara sayılır.</li>
              <li>Tarihler gg.aa.yyyy biçiminde okunur. Okunamayan ya da belirsiz tarihler uydurulmaz, orijinal ifade saklanır.</li>
              <li>Kayıtlı bir numarayla ya da dosyada tekrar eden satırlar işaretlenir ve varsayılan olarak atlanır. Hiçbir kayıt silinmez ya da birleştirilmez.</li>
              <li>Eski görüşme notu, tarihiyle birlikte görüşme geçmişine eklenir. Tarihi yoksa "tarihi bilinmiyor" olarak eklenir.</li>
            </ul>
          </div>
        </section>
      )}

      {step === 2 && mapping && sheet && (
        <section>
          <p className="lead">{fileName}: {sheet.rows.length} veri satırı.</p>
          {sheets.length > 1 && (
            <label className="field field-inline">
              <span>Sayfa</span>
              <select value={sheetIdx} onChange={(e) => chooseSheet(Number(e.target.value))}>
                {sheets.map((s, i) => <option key={s.name} value={i}>{s.name} ({s.rows.length} satır)</option>)}
              </select>
            </label>
          )}
          <div className="table-wrap always">
            <table className="table map-table">
              <thead><tr><th>CRM alanı</th><th>Dosyadaki sütun</th><th>İlk değerler</th></tr></thead>
              <tbody>
                {FIELDS.map((fd) => {
                  const idx = mapping[fd.key as FieldKey];
                  const samples = idx >= 0 ? sheet.rows.slice(0, 3).map((r) => r.cells[idx]?.text).filter(Boolean) : [];
                  return (
                    <tr key={fd.key}>
                      <th scope="row">{fd.label}{'required' in fd && fd.required && <span className="req"> (zorunlu)</span>}</th>
                      <td>
                        <select aria-label={`${fd.label} için sütun`} value={idx}
                          onChange={(e) => setMapping({ ...mapping, [fd.key]: Number(e.target.value) })}>
                          <option value={-1}>Aktarma</option>
                          {sheet.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                        </select>
                      </td>
                      <td className="samples">{samples.length ? samples.join(' | ') : <span className="muted">Boş</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {mapping.status < 0 && (
            <label className="field field-inline">
              <span>Durum sütunu yok. Aktarılan müşterilerin durumu:</span>
              <select value={defaultStatus} onChange={(e) => setDefaultStatus(e.target.value as Status)}>
                {STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
          )}
          <div className="form-actions start">
            <button className="btn" onClick={reset}>Başka dosya seç</button>
            <button className="btn btn-primary" onClick={toPreview}>Önizle</button>
          </div>
        </section>
      )}

      {step === 3 && <Preview rows={rows} setRows={setRows} view={view} setView={setView} busy={busy}
        onBack={() => setStep(2)} onCommit={commit} />}

      {step === 4 && result && (
        <EmptyState title={`${result.added} müşteri aktarıldı`}>
          <p>{result.skipped ? `${result.skipped} satır atlandı (tekrar ya da hatalı). ` : ''}Takip tarihi olanlar Bugün ekranında sıraya girdi.</p>
          <div className="btn-row">
            <a className="btn btn-primary" href="#/">Bugün ekranına git</a>
            <a className="btn" href="#/musteriler">Müşterileri gör</a>
            <button className="btn" onClick={reset}>Başka dosya aktar</button>
          </div>
        </EmptyState>
      )}
    </div>
  );
}

function Preview({ rows, setRows, view, setView, busy, onBack, onCommit }: {
  rows: PreviewRow[]; setRows: (r: PreviewRow[]) => void; view: View; setView: (v: View) => void;
  busy: boolean; onBack: () => void; onCommit: () => void;
}) {
  const counts = useMemo(() => ({
    include: rows.filter((r) => r.include).length,
    dup: rows.filter((r) => r.duplicate).length,
    error: rows.filter((r) => r.issues.some((i) => i.level === 'error')).length,
    warn: rows.filter((r) => r.issues.some((i) => i.level === 'warning')).length,
  }), [rows]);
  const shown = rows.filter((r) =>
    view === 'all' ? true
      : view === 'dup' ? !!r.duplicate
        : view === 'error' ? r.issues.some((i) => i.level === 'error')
          : r.issues.length > 0 || !!r.duplicate);

  function toggle(rowNumber: number, include: boolean) {
    setRows(rows.map((r) => (r.rowNumber === rowNumber ? { ...r, include } : r)));
  }

  const tabs: [View, string, number][] = [
    ['all', 'Tümü', rows.length],
    ['issues', 'Kontrol gereken', rows.filter((r) => r.issues.length || r.duplicate).length],
    ['dup', 'Tekrar', counts.dup],
    ['error', 'Hatalı', counts.error],
  ];

  return (
    <section>
      <p className="lead">
        {counts.include} satır eklenecek. {counts.dup > 0 && `${counts.dup} satır tekrar olarak işaretlendi ve atlanacak. `}
        {counts.error > 0 && `${counts.error} satır hatalı, aktarılamaz. `}
        {counts.warn > 0 && `${counts.warn} satırda uyarı var; uyarılar aktarımı engellemez.`}
      </p>
      <div className="tabs" role="tablist" aria-label="Önizleme filtresi">
        {tabs.map(([k, label, n]) => (
          <button key={k} role="tab" aria-selected={view === k} className="tab" onClick={() => setView(k)}>
            {label} <span className="count">{n}</span>
          </button>
        ))}
      </div>
      <div className="table-wrap always">
        <table className="table preview-table">
          <thead>
            <tr>
              <th>Ekle</th><th>Satır</th><th>İsim soyisim</th><th>Telefon</th><th>Son arama</th>
              <th>Görüşme notu</th><th>Takip</th><th>Kontrol</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const hasError = r.issues.some((i) => i.level === 'error');
              return (
                <tr key={r.rowNumber} className={hasError ? 'row-error' : r.duplicate ? 'row-dup' : ''}>
                  <td>
                    <input type="checkbox" checked={r.include} disabled={hasError}
                      aria-label={`${r.rowNumber}. satırı ekle`} onChange={(e) => toggle(r.rowNumber, e.target.checked)} />
                  </td>
                  <td className="num muted">{r.rowNumber}</td>
                  <td>{r.fullName || <span className="muted">Boş</span>}</td>
                  <td className="nowrap num">
                    {r.phone}
                    {r.phoneNorm && r.phone !== formatPhone(r.phone, r.phoneNorm) && <span className="muted small block">{formatPhone(r.phone, r.phoneNorm)}</span>}
                  </td>
                  <td className="nowrap num">
                    {r.lastCall?.date ? formatDate(r.lastCall.date) : r.lastCall?.raw ? <span className="muted">"{r.lastCall.raw}"</span> : ''}
                  </td>
                  <td><span className="clamp">{r.note}</span></td>
                  <td className="nowrap num">
                    {r.followUp ? `${formatDate(r.followUp.date)}${r.followUp.time ? ' ' + r.followUp.time : ''}` : r.followUpRaw ? <span className="muted">"{r.followUpRaw}"</span> : ''}
                  </td>
                  <td className="issues">
                    {r.duplicate && (
                      <p className="issue issue-dup">
                        {r.duplicate.text}.{' '}
                        {r.include ? 'Ayrı kayıt olarak eklenecek.' : <button className="link-btn" onClick={() => toggle(r.rowNumber, true)}>Yine de ekle</button>}
                      </p>
                    )}
                    {r.issues.map((i, k) => <p key={k} className={`issue issue-${i.level}`}>{i.text}</p>)}
                    {!r.duplicate && !r.issues.length && <span className="muted">Hazır</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="form-actions start sticky-actions">
        <button className="btn" onClick={onBack}>Eşleştirmeye dön</button>
        <button className="btn btn-primary" disabled={!counts.include || busy} onClick={onCommit}>
          {counts.include} müşteriyi aktar
        </button>
      </div>
    </section>
  );
}
