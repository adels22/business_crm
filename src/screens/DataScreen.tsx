import { useEffect, useRef, useState } from 'react';
import { Modal } from '../components/common';
import { isPersisted, requestPersistence } from '../data/db';
import { useStore } from '../data/store';
import { formatDate, pastPhrase } from '../domain/dates';
import type { Dataset, Workspace } from '../domain/types';
import { exportBackup, exportCsv, exportXlsx, parseBackup } from '../export/export';

export function DataScreen() {
  const s = useStore();
  const { workspace, data, lastBackupAt } = s;
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [pending, setPending] = useState<{ data: Dataset; createdAt: string; from: Workspace } | null>(null);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { void isPersisted().then(setPersisted); }, []);

  async function backup() {
    exportBackup(data, workspace);
    await s.markBackedUp();
    s.showToast('Yedek indirildi');
  }

  async function onRestoreFile(file?: File) {
    if (!file) return;
    setError('');
    try {
      const b = parseBackup(await file.text());
      setPending({ data: b.data, createdAt: b.createdAt, from: b.workspace });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function confirmRestore() {
    if (!pending) return;
    await s.restore(pending.data);
    setPending(null);
    s.showToast(`Yedek geri yüklendi: ${pending.data.customers.length} müşteri`);
  }

  return (
    <div className="page">
      <header className="page-head"><h1>Veri ve yedek</h1></header>

      <section className="panel" aria-labelledby="h-ws">
        <h2 id="h-ws">Çalışma alanı</h2>
        <div className="ws-options" role="radiogroup" aria-labelledby="h-ws">
          <WsOption ws="main" current={workspace} onPick={s.switchWorkspace} title="Kendi verilerim"
            text="Gerçek müşterileriniz. Excel aktarımı yalnızca buraya yapılır." />
          <WsOption ws="demo" current={workspace} onPick={s.switchWorkspace} title="Demo"
            text="Uydurma örnek kayıtlar. Denemek için; gerçek verilerle karışmaz." />
        </div>
        <p className="muted small">Şu an açık: {workspace === 'demo' ? 'Demo' : 'Kendi verilerim'}, {data.customers.length} müşteri, {data.calls.length} görüşme kaydı.</p>
      </section>

      <section className="panel warn-panel" aria-labelledby="h-store">
        <h2 id="h-store">Veriler nerede saklanıyor</h2>
        <p>Bu sürüm bir prototiptir. Kayıtlar <strong>yalnızca bu cihazdaki bu tarayıcıda</strong> durur; sunucu, giriş ya da eşitleme yoktur.</p>
        <ul>
          <li>Bu bilgisayara ve tarayıcı profiline erişen herkes kayıtları görebilir.</li>
          <li>Tarayıcı geçmişini ve site verilerini temizlemek kayıtları siler.</li>
          <li>Başka bir cihazda ya da başka bir tarayıcıda görünmez.</li>
        </ul>
        <p>Düzenli olarak yedek alın. Gerçek müşteri listesiyle uzun süreli kullanım için giriş ve sunucu yedeği olan sürüme geçilmesi önerilir.</p>
        <p className="small">
          Tarayıcı kalıcı depolama izni: {persisted === null ? 'bu tarayıcıda desteklenmiyor' : persisted ? 'verildi' : 'verilmedi'}
          {persisted === false && <> <button className="link-btn" onClick={async () => setPersisted(await requestPersistence())}>İzin iste</button></>}
        </p>
      </section>

      <section className="panel" aria-labelledby="h-backup">
        <h2 id="h-backup">Yedek</h2>
        <p>
          Son yedek: {lastBackupAt ? `${pastPhrase(lastBackupAt.slice(0, 10))} (${formatDate(lastBackupAt.slice(0, 10))})` : 'hiç alınmadı'}.
          {' '}Yedek dosyası tüm müşterileri, görüşme geçmişini ve takipleri içerir.
        </p>
        <div className="btn-row">
          <button className="btn btn-primary" onClick={backup} disabled={!data.customers.length}>Yedek al</button>
          <label className="btn">
            Yedekten geri yükle
            <input ref={fileRef} type="file" accept=".json,application/json" className="sr-only" onChange={(e) => onRestoreFile(e.target.files?.[0])} />
          </label>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
      </section>

      <section className="panel" aria-labelledby="h-export">
        <h2 id="h-export">Dışa aktar</h2>
        <p>Excel dosyası üç sayfa içerir: müşteriler (Excel'deki sütun düzeniyle), tüm görüşmeler ve takipler. Bu dosyayı tekrar içe aktarırsanız mevcut kayıtlar tekrar olarak işaretlenir.</p>
        <div className="btn-row">
          <button className="btn" onClick={() => exportXlsx(data, workspace)} disabled={!data.customers.length}>Excel olarak indir</button>
          <button className="btn" onClick={() => exportCsv(data, workspace)} disabled={!data.customers.length}>CSV olarak indir</button>
        </div>
      </section>

      {workspace === 'demo' && (
        <section className="panel" aria-labelledby="h-demo">
          <h2 id="h-demo">Demo verisi</h2>
          <p>Demo kayıtlarını ilk hâline döndürür. Kendi verilerinize dokunmaz.</p>
          <button className="btn" onClick={async () => { await s.resetDemo(); s.showToast('Demo verisi sıfırlandı'); }}>Demo verisini sıfırla</button>
        </section>
      )}

      <Modal open={!!pending} onClose={() => setPending(null)} title="Yedekten geri yükle" size="sm" labelledBy="restore-title">
        {pending && (
          <div className="form">
            <p>
              Yedek tarihi: {pending.createdAt ? formatDate(pending.createdAt.slice(0, 10)) : 'bilinmiyor'}, {pending.data.customers.length} müşteri, {pending.data.calls.length} görüşme.
            </p>
            {pending.from !== workspace && (
              <p className="notice-inline">Bu yedek {pending.from === 'demo' ? 'Demo' : 'Kendi verilerim'} alanından alınmış; şu an açık olan alana yüklenecek.</p>
            )}
            <p><strong>"{workspace === 'demo' ? 'Demo' : 'Kendi verilerim'}" alanındaki {data.customers.length} müşterinin yerini alacak.</strong> Emin değilseniz önce mevcut verilerin yedeğini alın.</p>
            <div className="form-actions">
              <button className="btn" onClick={() => setPending(null)}>Vazgeç</button>
              <button className="btn btn-danger" onClick={confirmRestore}>Yedeği geri yükle</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function WsOption({ ws, current, onPick, title, text }: { ws: Workspace; current: Workspace; onPick: (w: Workspace) => void; title: string; text: string }) {
  return (
    <label className="ws-option">
      <input type="radio" name="ws" checked={ws === current} onChange={() => onPick(ws)} />
      <span><strong>{title}</strong><span className="muted">{text}</span></span>
    </label>
  );
}
