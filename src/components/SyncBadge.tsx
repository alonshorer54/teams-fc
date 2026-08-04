import { AlertTriangle, Cloud, CloudUpload, HardDrive, LogOut, RefreshCw } from 'lucide-react';
import type { SyncStatus } from '../hooks/useSyncedStore';

const LABELS: Record<SyncStatus, { text: string; tone: string; Icon: typeof Cloud; spin?: boolean }> = {
  local: { text: 'מקומי', tone: 'border-slate-700 bg-slate-800/60 text-slate-300', Icon: HardDrive },
  loading: { text: 'טוען...', tone: 'border-sky-500/30 bg-sky-500/10 text-sky-300', Icon: RefreshCw, spin: true },
  saving: { text: 'שומר...', tone: 'border-sky-500/30 bg-sky-500/10 text-sky-300', Icon: CloudUpload },
  synced: { text: 'מסונכרן', tone: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300', Icon: Cloud },
  error: { text: 'שגיאת סנכרון', tone: 'border-rose-500/30 bg-rose-500/10 text-rose-300', Icon: AlertTriangle },
};

export function SyncBadge({
  status,
  email,
  lastSyncedAt,
  error,
  onSignOut,
}: {
  status: SyncStatus;
  email: string | null;
  lastSyncedAt: string | null;
  error: string | null;
  onSignOut: () => void;
}) {
  const { text, tone, Icon, spin } = LABELS[status];

  const time = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold ${tone}`}
        title={error ?? (time ? `סונכרן לאחרונה ב-${time}` : undefined)}
      >
        <Icon size={13} className={spin ? 'animate-spin' : undefined} />
        {text}
        {status === 'synced' && time && <span className="font-mono text-slate-400">{time}</span>}
      </span>

      {email && (
        <button
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-700/80 bg-slate-800/50 px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 transition hover:border-slate-600 hover:text-white"
          onClick={onSignOut}
          title={`מחובר כ-${email}`}
        >
          <LogOut size={13} />
          יציאה
        </button>
      )}
    </div>
  );
}
