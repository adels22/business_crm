import { useEffect } from 'react';
import { ActionsProvider, useActions } from './components/actions';
import { Icon, useRoute } from './components/common';
import { useStore } from './data/store';
import { daysBetween, today } from './domain/dates';
import { CustomerDetail } from './screens/CustomerDetail';
import { Customers } from './screens/Customers';
import { DataScreen } from './screens/DataScreen';
import { Import } from './screens/Import';
import { Today } from './screens/Today';

const NAV = [
  { href: '#/', key: '', label: 'Bugün', icon: 'today' },
  { href: '#/musteriler', key: 'musteriler', label: 'Müşteriler', icon: 'people' },
  { href: '#/aktar', key: 'aktar', label: 'Excel aktarımı', short: 'Aktar', icon: 'import' },
  { href: '#/veri', key: 'veri', label: 'Veri ve yedek', short: 'Veri', icon: 'data' },
];

export function App() {
  return (
    <ActionsProvider>
      <Shell />
    </ActionsProvider>
  );
}

function Shell() {
  const { ready, workspace, switchWorkspace, data, lastBackupAt } = useStore();
  const { path, query } = useRoute();
  const { editCustomer } = useActions();
  const section = path[0] === 'musteri' ? 'musteriler' : (path[0] ?? '');

  const backupDue = workspace === 'main' && data.customers.length > 0 &&
    (!lastBackupAt || daysBetween(lastBackupAt.slice(0, 10), today()) >= 7);

  let page: React.ReactNode;
  if (!ready) page = <div className="page"><p className="muted">Yükleniyor</p></div>;
  else if (path[0] === 'musteri' && path[1]) page = <CustomerDetail id={path[1]} />;
  else if (path[0] === 'musteriler') page = <Customers query={query} />;
  else if (path[0] === 'aktar') page = <Import />;
  else if (path[0] === 'veri') page = <DataScreen />;
  else page = <Today />;

  return (
    <div className={`app ws-${workspace}`}>
      <a className="skip" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>İçeriğe geç</a>
      <nav className="rail" aria-label="Ana menü">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">Danışman CRM</span>
        </div>
        <ul>
          {NAV.map((n) => (
            <li key={n.key}>
              <a href={n.href} aria-current={section === n.key ? 'page' : undefined}>
                <Icon name={n.icon} size={20} />
                <span className="nav-long">{n.label}</span>
                <span className="nav-short">{n.short ?? n.label}</span>
              </a>
            </li>
          ))}
        </ul>
        <div className="rail-foot">
          <button className="btn btn-rail" onClick={() => editCustomer()}><Icon name="plus" size={16} />Yeni müşteri</button>
          <p className="ws-label">
            {workspace === 'demo' ? 'Demo çalışma alanı' : 'Kendi verilerim'}
            <span>Yalnızca bu tarayıcıda saklanır</span>
          </p>
        </div>
      </nav>

      <div className="main-col">
        {workspace === 'demo' && (
          <div className="banner banner-demo" role="note">
            <p><strong>Demo verileri.</strong> Buradaki kişiler ve numaralar uydurmadır, gerçek değildir.</p>
            <button className="btn btn-sm" onClick={() => switchWorkspace('main')}>Kendi verilerime geç</button>
          </div>
        )}
        {backupDue && section !== 'veri' && (
          <div className="banner banner-backup" role="note">
            <p>{lastBackupAt ? '7 günden uzun süredir yedek alınmadı.' : 'Henüz yedek alınmadı.'} Kayıtlar yalnızca bu tarayıcıda duruyor.</p>
            <a className="btn btn-sm" href="#/veri">Yedek al</a>
          </div>
        )}
        <main id="main" tabIndex={-1}>{page}</main>
      </div>
      <Toaster />
    </div>
  );
}

function Toaster() {
  const { toast, dismissToast } = useStore();
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(dismissToast, toast.undo ? 7000 : 4000);
    return () => clearTimeout(t);
  }, [toast, dismissToast]);
  return (
    <div className="toast-region" role="status" aria-live="polite">
      {toast && (
        <div className="toast" key={toast.id}>
          <span>{toast.text}</span>
          {toast.undo && <button className="link-btn" onClick={() => { toast.undo!(); dismissToast(); }}>Geri al</button>}
        </div>
      )}
    </div>
  );
}
