import { useMemo, useState } from 'react';
import {
  CalendarDays,
  ChevronDown,
  Copy,
  History,
  RotateCcw,
  Trash2,
  TrendingDown,
  TrendingUp,
  Trophy,
  UserX,
} from 'lucide-react';
import {
  PLACEMENT_META,
  TEAM_IDS,
  TEAM_META,
  recordPlacements,
  type MatchRecord,
  type Placement,
  type Placements,
  type TeamId,
} from '../types';
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
  onSetResult: (id: string, placements: Placements | null) => void;
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
        const placements = recordPlacements(record);
        const winners = placements ? TEAM_IDS.filter((t) => placements[t] === 1) : [];

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
                    {placements ? (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 font-semibold text-amber-300">
                        <Trophy size={9} />
                        {winners.length === 0
                          ? 'כולן שוות'
                          : winners.length === TEAM_IDS.length
                            ? 'כולן ניצחו'
                            : `${winners.map((t) => TEAM_META[t].name).join(' + ')} למעלה`}
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
                  value={placements}
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
                    const place = placements?.[id];

                    return (
                      <div
                        key={id}
                        className={`overflow-hidden rounded-xl border ${
                          place === 1 ? 'border-amber-400/70 ring-1 ring-amber-400/40' : meta.ring
                        }`}
                      >
                        <div className={`flex items-center justify-between px-3 py-2 ${meta.header}`}>
                          <span className="flex items-center gap-1.5 text-sm font-extrabold">
                            {place && <span title={PLACEMENT_META[place].label}>{PLACEMENT_META[place].emoji}</span>}
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

const PLACEMENT_TONE: Record<Placement, string> = {
  1: 'border-amber-400/60 bg-amber-500/20 text-amber-200',
  2: 'border-sky-500/50 bg-sky-500/15 text-sky-200',
  3: 'border-rose-500/50 bg-rose-500/15 text-rose-200',
};

function ResultPicker({
  value,
  onChange,
}: {
  value: Placements | null;
  onChange: (next: Placements | null) => void;
}) {
  /** קיצורי דרך לתרחישים הנפוצים */
  const presets: { label: string; build: () => Placements }[] = [
    ...TEAM_IDS.map((t) => ({
      label: `${TEAM_META[t].emoji} ${TEAM_META[t].name} ניצחה הכל`,
      build: () =>
        Object.fromEntries(TEAM_IDS.map((x) => [x, x === t ? 1 : 3])) as Placements,
    })),
    ...TEAM_IDS.map((t) => ({
      label: `${TEAM_META[t].emoji} ${TEAM_META[t].name} הפסידה הכל`,
      build: () =>
        Object.fromEntries(TEAM_IDS.map((x) => [x, x === t ? 3 : 1])) as Placements,
    })),
    {
      label: '🤝 כולן שוות',
      build: () => ({ white: 2, black: 2, colored: 2 }),
    },
  ];

  const setPlace = (team: TeamId, place: Placement) => {
    const base: Placements = value ?? { white: 2, black: 2, colored: 2 };
    onChange({ ...base, [team]: place });
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
      <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-slate-400">
        <Trophy size={12} className="text-amber-400" />
        איך נגמר הערב? (עדכנו אחרי המשחק)
      </p>
      <p className="mb-2.5 text-[10px] leading-relaxed text-slate-500">
        דרגו כל קבוצה. אפשר לתת לשתי קבוצות את אותו מקום — למשל שתיים ניצחו ואחת הפסידה.
      </p>

      {/* קיצורי דרך */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <button
            key={p.label}
            onClick={() => onChange(p.build())}
            className="cursor-pointer rounded-lg border border-slate-700 bg-slate-800/50 px-2 py-1 text-[10px] font-semibold text-slate-300 transition hover:border-amber-500/40 hover:text-amber-200"
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* דירוג ידני לכל קבוצה */}
      <ul className="space-y-1.5">
        {TEAM_IDS.map((t) => (
          <li key={t} className="flex items-center gap-2">
            <span className="flex w-24 shrink-0 items-center gap-1.5 text-[11px] font-bold text-slate-200">
              <span className={`size-2.5 rounded-full ${TEAM_META[t].dot}`} />
              {TEAM_META[t].name}
            </span>
            <div className="flex flex-1 gap-1">
              {([1, 2, 3] as Placement[]).map((place) => (
                <button
                  key={place}
                  onClick={() => setPlace(t, place)}
                  className={`flex-1 cursor-pointer rounded-lg border px-2 py-1.5 text-[10px] font-bold transition ${
                    value?.[t] === place
                      ? PLACEMENT_TONE[place]
                      : 'border-slate-700 bg-slate-800/40 text-slate-400 hover:border-slate-600 hover:text-white'
                  }`}
                >
                  {PLACEMENT_META[place].emoji} {PLACEMENT_META[place].label}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>

      {value && (
        <button
          className="mt-2 w-full rounded-lg py-1 text-[10px] font-semibold text-slate-500 transition hover:bg-slate-800/60 hover:text-slate-300"
          onClick={() => onChange(null)}
        >
          ניקוי התוצאה
        </button>
      )}
    </div>
  );
}

/* ---------------------------- לוח סטטיסטיקה ---------------------------- */

function StatsPanel({ stats }: { stats: ReturnType<typeof computeHistoryStats> }) {
  const hasResults = stats.totalWithResult > 0;
  const last = stats.lastResolved;

  return (
    <section className="card space-y-4 p-4">
      <div>
        <h2 className="mb-1 flex flex-wrap items-center gap-2 text-sm font-bold text-slate-100">
          <Trophy size={16} className="text-amber-400" />
          מי מנצח ומי מפסיד
          {stats.pending > 0 && (
            <span className="rounded-md bg-slate-700/70 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300">
              {stats.pending} ממתינות לעדכון
            </span>
          )}
        </h2>
        <p className="mb-3 text-[11px] text-slate-500">
          לפי שחקנים ולא לפי צבע קבוצה — הצבעים מתחלפים כל שבוע.
        </p>

        {!hasResults ? (
          <p className="text-xs text-slate-400">
            עדיין לא עודכנה אף תוצאה. פתחו הגרלה למטה וסמנו מי ניצח — כאן תראו מי בסדרת הפסדים.
          </p>
        ) : (
          <div className="space-y-4">
            {last && last.winners.length > 0 && (
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3">
                <p className="mb-2 text-[11px] font-bold text-emerald-300">
                  מי היה למעלה בשבוע האחרון ({formatHebrewDate(last.record.date)})
                </p>
                <ul className="flex flex-wrap gap-1.5">
                  {TEAM_IDS.flatMap((t) => last.record.teams[t])
                    .filter((p) => last.winners.includes(p.id))
                    .map((p) => (
                      <li
                        key={p.id}
                        className="rounded-lg bg-emerald-500/15 px-2 py-1 text-[11px] font-semibold text-emerald-200"
                      >
                        {p.name}
                      </li>
                    ))}
                </ul>
              </div>
            )}

            {stats.coldStreak.length > 0 && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-amber-300">
                  <TrendingDown size={12} />
                  בסדרת הפסדים — שווה לחזק אותם השבוע
                </p>
                <ul className="flex flex-wrap gap-1.5">
                  {stats.coldStreak.map((p) => (
                    <li
                      key={p.id}
                      className="rounded-lg bg-amber-500/15 px-2 py-1 text-[11px] font-semibold text-amber-200"
                    >
                      {p.name}
                      <span className="mr-1 font-mono opacity-80">{Math.abs(p.streak)} ברצף</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <PlayerTable players={stats.players} />
          </div>
        )}
      </div>

      <p className="border-t border-slate-800/70 pt-3 text-[10px] text-slate-500">
        נוכחות לאורך זמן, כימיה משחקית וביטולים נמצאים בלשונית "מגמות".
      </p>
    </section>
  );
}

/* ------------------------- טבלת שחקנים ------------------------- */

function PlayerTable({ players }: { players: ReturnType<typeof computeHistoryStats>['players'] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? players : players.slice(0, 8);

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[26rem] text-xs">
          <thead>
            <tr className="text-[10px] text-slate-500">
              <th className="px-2 py-1.5 text-right font-semibold">שחקן</th>
              <th className="px-2 py-1.5 text-center font-semibold">משחקים</th>
              <th className="px-2 py-1.5 text-center font-semibold">נצ׳</th>
              <th className="px-2 py-1.5 text-center font-semibold">הפ׳</th>
              <th className="px-2 py-1.5 text-center font-semibold">אחוז</th>
              <th className="px-2 py-1.5 text-center font-semibold">רצף</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {visible.map((p) => (
              <tr key={p.id} className="text-slate-200">
                <td className="max-w-[9rem] truncate px-2 py-1.5 font-semibold">{p.name}</td>
                <td className="px-2 py-1.5 text-center font-mono text-slate-400 tabular-nums">
                  {p.played}
                </td>
                <td className="px-2 py-1.5 text-center font-mono text-emerald-300 tabular-nums">
                  {p.wins}
                </td>
                <td className="px-2 py-1.5 text-center font-mono text-rose-300 tabular-nums">
                  {p.losses}
                </td>
                <td className="px-2 py-1.5 text-center font-mono tabular-nums">
                  {Math.round(p.winRate * 100)}%
                </td>
                <td className="px-2 py-1.5 text-center">
                  <StreakBadge streak={p.streak} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {players.length > 8 && (
        <button
          className="mt-2 w-full rounded-lg py-1.5 text-[11px] font-semibold text-slate-400 transition hover:bg-slate-800/60 hover:text-slate-200"
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll ? 'הצגת 8 המובילים בלבד' : `הצגת כל ${players.length} השחקנים`}
        </button>
      )}
    </div>
  );
}

export function StreakBadge({ streak }: { streak: number }) {
  if (streak === 0) return <span className="text-slate-600">—</span>;
  const win = streak > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums ${
        win ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'
      }`}
      title={win ? `ניצח ${streak} שבועות ברצף` : `הפסיד ${Math.abs(streak)} שבועות ברצף`}
    >
      {win ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
      {Math.abs(streak)}
    </span>
  );
}
