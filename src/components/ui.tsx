import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

/* ---------------------------- מודאל בסיסי ---------------------------- */

export function Modal({
  open,
  onClose,
  title,
  icon,
  children,
  maxWidth = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  maxWidth?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/75 p-4 backdrop-blur-sm sm:items-center">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div className={`card animate-pop relative my-auto w-full ${maxWidth} p-5 sm:p-6`}>
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-100">
            {icon}
            {title}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
            aria-label="סגירה"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* --------------------------- דיאלוג אישור --------------------------- */

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'מחיקה',
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title} maxWidth="max-w-sm">
      <div className="text-sm leading-relaxed text-slate-300">{message}</div>
      <div className="mt-6 flex gap-2">
        <button className="btn-danger flex-1" onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button className="btn-ghost flex-1" onClick={onCancel}>
          ביטול
        </button>
      </div>
    </Modal>
  );
}

/* ------------------------------- טוסט ------------------------------- */

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4">
      <div className="animate-pop rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-5 py-3 text-sm font-semibold text-emerald-200 shadow-xl shadow-black/40 backdrop-blur">
        {message}
      </div>
    </div>
  );
}

/* ------------------------------ מצב ריק ------------------------------ */

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-14 text-center">
      <div className="rounded-2xl bg-slate-800/60 p-4 text-slate-400">{icon}</div>
      <h3 className="text-base font-bold text-slate-200">{title}</h3>
      {hint && <p className="max-w-sm text-sm leading-relaxed text-slate-400">{hint}</p>}
      {action}
    </div>
  );
}

/* ------------------------- תגית דירוג צבעונית ------------------------- */

export function RatingBadge({ rating, size = 'md' }: { rating: number; size?: 'sm' | 'md' }) {
  const tone =
    rating >= 4.3
      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
      : rating >= 3.5
        ? 'bg-sky-500/20 text-sky-300 border-sky-500/30'
        : rating >= 2.5
          ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
          : 'bg-slate-500/20 text-slate-300 border-slate-500/30';

  return (
    <span
      dir="ltr"
      className={`inline-flex shrink-0 items-center justify-center rounded-lg border font-mono font-bold tabular-nums ${tone} ${
        size === 'sm' ? 'min-w-9 px-1.5 py-0.5 text-[11px]' : 'min-w-11 px-2 py-1 text-xs'
      }`}
    >
      {rating.toFixed(1)}
    </span>
  );
}
