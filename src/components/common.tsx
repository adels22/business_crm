import { useEffect, useRef, useState, type ReactNode } from 'react';
import { formatPhone, telHref } from '../domain/phone';
import { formatDate, relativeDue, today } from '../domain/dates';
import type { Customer, FollowUp, Status } from '../domain/types';

export function navigate(path: string) {
  location.hash = path;
}

export interface Route { path: string[]; query: URLSearchParams }
function readRoute(): Route {
  const [p, q = ''] = location.hash.replace(/^#\/?/, '').split('?');
  return { path: p.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(q) };
}
export function useRoute(): Route {
  const read = readRoute;
  const [r, setR] = useState(read);
  useEffect(() => {
    const on = () => { setR(read()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return r;
}

export function PhoneLink({ customer, className }: { customer: Customer; className?: string }) {
  if (!customer.phone) return <span className="muted">Telefon yok</span>;
  const href = telHref(customer.phone, customer.phoneNorm);
  const text = formatPhone(customer.phone, customer.phoneNorm);
  if (!href) return <span className={className}>{text}</span>;
  return (
    <a className={`phone ${className ?? ''}`} href={href} aria-label={`${customer.fullName} adlı kişiyi ara: ${text}`}>
      <Icon name="phone" />
      <span className="num">{text}</span>
    </a>
  );
}

const STATUS_TONE: Record<Status, string> = {
  'Yeni': 'new',
  'Ulaşılamadı': 'quiet',
  'Görüşüldü': 'mid',
  'Randevu planlandı': 'strong',
  'Teklif iletildi': 'strong',
  'Müşteri oldu': 'won',
  'İlgilenmiyor': 'off',
};
export function StatusBadge({ status }: { status: Status }) {
  return <span className={`status status-${STATUS_TONE[status]}`}>{status}</span>;
}

export function DemoTag() {
  return <span className="demo-tag" title="Örnek kayıt; gerçek bir kişi değildir">Demo</span>;
}

/** Ajanda sütunu: takip zamanı ya da gecikme. */
export function DueLabel({ f, ref = today() }: { f: FollowUp; ref?: string }) {
  const late = f.dueDate < ref;
  return (
    <span className={`due ${late ? 'due-late' : ''}`}>
      <span className="due-main">{f.dueDate === ref ? (f.dueTime ?? 'Gün içinde') : relativeDue(f.dueDate, ref)}</span>
      <span className="due-sub">
        {f.dueDate === ref ? 'Bugün' : late ? formatDate(f.dueDate) : f.dueTime ?? formatDate(f.dueDate)}
        {late && f.dueTime ? ` ${f.dueTime}` : ''}
      </span>
    </span>
  );
}

const ICONS: Record<string, string> = {
  phone: 'M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z',
  today: 'M7 2v3M17 2v3M3.5 9h17M5 5h14a1.5 1.5 0 0 1 1.5 1.5v12A1.5 1.5 0 0 1 19 20H5a1.5 1.5 0 0 1-1.5-1.5v-12A1.5 1.5 0 0 1 5 5zM8 13h3v3H8z',
  people: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.2a3.5 3.5 0 0 1 0 6.6M18 14a6.5 6.5 0 0 1 3.5 6',
  import: 'M12 3v12M7 10l5 5 5-5M4 17v2.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V17',
  data: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6',
  plus: 'M12 5v14M5 12h14',
  search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5 20 20',
  close: 'M6 6l12 12M18 6 6 18',
  back: 'M15 5l-7 7 7 7',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  note: 'M5 4h14v16H5zM8.5 9h7M8.5 13h7M8.5 17h4',
};
export function Icon({ name, size = 18 }: { name: keyof typeof ICONS | string; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none"
      stroke="currentColor" strokeWidth={name === 'phone' ? 0 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={ICONS[name]} fill={name === 'phone' ? 'currentColor' : 'none'} />
    </svg>
  );
}

/** Erişilebilir modal: yerel <dialog>, Esc ile kapanır, odak içeride kalır. */
export function Modal({ open, onClose, title, children, size = 'md', labelledBy }: {
  open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; size?: 'sm' | 'md'; labelledBy?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      opener.current = document.activeElement;
      d.showModal();
    } else if (!open && d.open) {
      d.close();
      (opener.current as HTMLElement | null)?.focus?.();
    }
  }, [open]);
  const id = labelledBy ?? 'modal-title';
  return (
    <dialog ref={ref} className={`modal modal-${size}`} aria-labelledby={id}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      {open && (
        <div className="modal-inner">
          <header className="modal-head">
            <h2 id={id}>{title}</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Kapat"><Icon name="close" /></button>
          </header>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {children}
    </div>
  );
}
