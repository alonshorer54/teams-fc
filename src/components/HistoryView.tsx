import { useMemo, useState } from 'react';
import {
  CalendarDays,
  ChevronDown,
  Copy,
  History,
  RotateCcw,
  Trash2,
  Trophy,
  UserX,
} from 'lucide-react';
import { TEAM_IDS, TEAM_META, type MatchRecord, type MatchResult } from '../types';
import { buildWhatsAppText, copyToClipboard, formatHebrewDate } from '../lib/format';
import { computeHistoryStats } from '../lib/stats';
import { ConfirmDialog, EmptyState } from './ui';

export function HistoryView({
  history,
  onDelete,
  onSetResult,
  onRestore,
  notify,
}: {
  history: MatchRecord[];
  onDelete: (id: string) => void;
  onSetResult: (id: string, result: MatchResult | null) => void;
  onRestore: (record: MatchRecord) => void;
  notify: (msg: string) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(history[0]?.id ?? null);
  const [pendingDelete, setPendingDelete] = useState<MatchRecord | null>(null);

  const stats = useMemo(() => computeHistoryStats(history), [history]);

  if (history.length === 0) {
    return (
      <EmptyState
        icon={<History size={28} />}
        title="אין עדיין הגרלות שמורות"
        hint='אחרי שתסיימו לסדר את הכוחות, לחצו על "שמירת הכוחות" והם יופיעו כאן.'
      />
    );
  }

  const copyRecord = async (record: MatchRecord) => {
    const text = buildWhatsAppText(
      {
        white: record.teams.white.map((p) => p.name),
        black: record.teams.black.map((p) => p.name),
        colored: record.teams.colored.map((p) => p.name),
      },
      { includeDate: true, date: record.date },
    );
    const ok = await copyToClipboard(text);
    notify(ok ? 'הועתק ללוח 📋' : 'ההעתקה נכשלה');
  };

  return (
    <div className="space-y-4">
      <StatsPanel stats={stats} />

      <p className="px-1 text-xs text-slate-400">
        {history.length === 1 ? 'הגרלה אחת שמורה' : `${history.length} הגרלות שמורות`} · הכי חדשות
        למעלה
      </p>

      {history.map((record) => {
        const isOpen = expanded === record.id;
        const total = TEAM_IDS.reduce((s, t) => s + record.teams[t].length, 0);
        const cancelled = record.cancelled ?? [];

        return (
          <article key={record.id} className="card overflow-hidden">
            <header className="flex items-center gap-2 px-4 py-3">
              <button
                className="flex min-w-0 flex-1 items-center gap-3 text-right"
                onClick={() => setExpanded(isOpen ? null : record.id)}
              >
                <CalendarDays size={17} className="shrink-0 text-emerald-400" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-100">
                    {formatHebrewDate(record.date)}
                  </p>
                  <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                    <span>{total} שחקנים</span>
                    {cancelled.length > 0 && (
                      <span className="text-rose-400/80">
                        · {cancelled.length === 1 ? 'ביטול אחד' : `${cancelled.length} ביטולים`}
                      </span>
                    )}
                    {record.result ? (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 font-semibold text-amber-300">
                        <Trophy size={9} />
                        {record.result === 'draw' ? 'תיקו' : `ניצחה ${TEAM_META[record.result].name}`}
                      </span>
                    ) : (
                      <span className="rounded bg-slate-700/60 px-1.5 py-0.5 font-semibold text-slate-300">
                        טרם עודכן
                      </span>
                    )}
                  </p>
                </div>
                <ChevronDown
                  size={16}
                  className={`mr-auto shrink-0 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                />
              </button>

              <div className="flex shrink-0 gap-1">
                <button
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-emerald-300"
                  title="העתקה לוואטסאפ"
                  onClick={() => copyRecord(record)}
                >
                  <Copy size={15} />
                </button>
                <button
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-sky-300"
                  title="טעינה חזרה למסך ההגרלה"
                  onClick={() => {
                    onRestore(record);
                    notify('ההגרלה נטענה למסך הכוחות');
                  }}
                >
                  <RotateCcw size={15} />
                </button>
                <button
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-500/15 hover:text-rose-300"
                  title="מחיקה"
                  onClick={() => setPendingDelete(record)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </header>

            {isOpen && (
              <div className="space-y-4 border-t border-slate-800/70 p-4">
                <ResultPicker
                  value={record.result}
                  onChange={(next) => {
                    onSetResult(record.id, next);
                    notify(next ? 'התוצאה עודכנה' : 'התוצאה נוקתה');
                  }}
                />

                <div className="grid gap-3 sm:grid-cols-3">
                  {TEAM_IDS.map((id) => {
                    const meta = TEAM_META[id];
                    const members = record.teams[id];
                    const avg = members.length
                      ? members.reduce((s, p) => s + p.rating, 0) / members.length
                      : 0;
                    const won = record.result === id;

                    return (
                      <div
                        key={id}
                        className={`overflow-hidden rounded-xl border ${
                          won ? 'border-amber-400/70 ring-1 ring-amber-400/40' : meta.ring
                        }`}
                      >
                        <div className={`flex items-center justify-between px-3 py-2 ${meta.header}`}>
                          <span className="flex items-center gap-1.5 text-sm font-extrabold">
                            {won && <Trophy size={13} />}
                            {meta.emoji} {meta.name}
                          </span>
                          <span dir="ltr" className="font-mono text-[11px] tabular-nums opacity-80">
                            ⌀ {avg.toFixed(2)}
                          </span>
                        </div>
                        <ul className={`divide-y divide-slate-800/60 ${meta.softBg}`}>
                          {members.map((p) => (
                            <li
                              key={p.id}
                              className="flex items-center justify-between gap-2 px-3 py-1.5 text-[13px] text-slate-200"
                            >
                              <span className="truncate">{p.name}</span>
                              <span
                                dir="ltr"
                                className="font-mono text-[11px] text-slate-500 tabular-nums"
                              >
                                {p.rating.toFixed(1)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>

                {cancelled.length > 0 && (
                  <div className="rounded-xl border border-rose-500/25 bg-rose-500/5 p-3">
                    <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-rose-300">
                      <UserX size={12} />
                      ביטלו הגעה השבוע
                    </p>
                    <ul className="flex flex-wrap gap-1.5">
                      {cancelled.map((p) => (
                        <li
                          key={p.id}
                          className="rounded-lg bg-rose-500/15 px-2 py-1 text-[11px] font-semibold text-rose-200"
                        >
                          {p.name}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </article>
        );
      })}

      <ConfirmDialog
        open={!!pendingDelete}
        title="מחיקת הגרלה"
        message={
          <>
            למחוק את ההגרלה מ־
            <b className="text-slate-100">{pendingDelete && formatHebrewDate(pendingDelete.date)}</b>?
          </>
        }
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) onDelete(pendingDelete.id);
          setPendingDelete(null);
        }}
      />
    </div>
  );
}

/* --------------------------- בחירת המנצחת --------------------------- */

function ResultPicker({
  value,
  onChange,
}: {
  value?: MatchResult;
  onChange: (next: MatchResult | null) => void;
}) {
  const options: { id: MatchResult; label: string }[] = [
    ...TEAM_IDS.map((t) => ({
      id: t as MatchResult,
      label: `${TEAM_META[t].emoji} ${TEAM_META[t].name}`,
    })),
    { id: 'draw', label: '🤝 תיקו' },
  ];

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-slate-400">
        <Trophy size={12} className="text-amber-400" />
        מי ניצח? (עדכנו אחרי המשחק)
      </p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.id}
            onClick={() => onChange(value === o.id ? null : o.id)}
            className={`cursor-pointer rounded-lg border px-3 py-1.5 text-[11px] font-bold transition ${
              value === o.id
                ? 'border-amber-400/60 bg-amber-500/20 text-amber-200'
                : 'border-slate-700 bg-slate-800/50 text-slate-300 hover:border-slate-600 hover:text-white'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------- לוח סטטיסטיקה ---------------------------- */

function StatsPanel({ stats }: { stats: ReturnType<typeof computeHistoryStats> }) {
  const hasResults = stats.totalWithResult > 0;

  return (
    <section className="card space-y-4 p-4">
      <div>
        <h2 className="mb-3 flex flex-wrap items-center gap-2 text-sm font-bold text-slate-100">
          <Trophy size={16} className="text-amber-400" />
          טבלת הניצחונות
          {stats.pending > 0 && (
            <span className="rounded-md bg-slate-700/70 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300">
              {stats.pending} ממתינות לעדכון
            </span>
          )}
        </h2>

        {!hasResults ? (
          <p className="text-xs text-slate-400">
            עדיין לא עודכנה אף תוצאה. פתחו הגרלה למטה וסמנו מי ניצח — הטבלה תתמלא לבד.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {TEAM_IDS.map((id) => {
              const t = stats.teams[id];
              const isLeader = stats.leader === id;
              return (
                <div
                  key={id}
                  className={`rounded-xl border px-3 py-2.5 text-center ${
                    isLeader
                      ? 'border-amber-400/60 bg-amber-500/10'
                      : 'border-slate-800 bg-slate-900/40'
                  }`}
                >
                  <p className="flex items-center justify-center gap-1 text-[11px] font-semibold text-slate-300">
                    <span className={`size-2 rounded-full ${TEAM_META[id].dot}`} />
                    {TEAM_META[id].name}
                    {isLeader && <Trophy size={10} className="text-amber-400" />}
                  </p>
                  <p className="mt-1 font-mono text-2xl font-bold text-slate-100 tabular-nums">
                    {t.wins}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {Math.round(t.winRate * 100)}% מתוך {t.played}
                  </p>
                </div>
              );
            })}
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2.5 text-center">
              <p className="text-[11px] font-semibold text-slate-300">🤝 תיקו</p>
              <p className="mt-1 font-mono text-2xl font-bold text-slate-100 tabular-nums">
                {stats.draws}
              </p>
              <p className="text-[10px] text-slate-500">משחקים</p>
            </div>
          </div>
        )}
      </div>

      {stats.cancellers.length > 0 && (
        <div className="border-t border-slate-800/70 pt-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-100">
            <UserX size={16} className="text-rose-400" />
            מי מבטל הכי הרבה
          </h2>
          <ul className="space-y-1.5">
            {stats.cancellers.slice(0, 8).map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-3 rounded-lg bg-slate-900/50 px-3 py-2 text-xs"
              >
                <span className="min-w-0 flex-1 truncate font-semibold text-slate-200">{c.name}</span>
                <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-800 sm:w-24">
                  <div
                    className="h-full rounded-full bg-rose-500/70"
                    style={{ width: `${Math.min(100, Math.round(c.rate * 100))}%` }}
                  />
                </div>
                <span className="shrink-0 font-mono text-slate-400 tabular-nums">
                  {c.cancellations}/{c.appearances}
                </span>
                <span className="w-10 shrink-0 text-left font-mono text-rose-300 tabular-nums">
                  {Math.round(c.rate * 100)}%
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] text-slate-500">
            מספר הביטולים מתוך מספר השבועות שהשחקן הופיע ברשימה.
          </p>
        </div>
      )}
    </section>
  );
}
