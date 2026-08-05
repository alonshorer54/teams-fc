import { useMemo, useState } from 'react';
import {
  BarChart3,
  CalendarX,
  Link2,
  Sparkles,
  TrendingDown,
  TrendingUp,
  UserX,
} from 'lucide-react';
import type { MatchRecord, Player } from '../types';
import { computeAttendance, type PlayerAttendance, type WeekStatus } from '../lib/attendance';
import { CONFIDENCE_LABEL, MIN_GAMES_TOGETHER, computePairChemistry } from '../lib/pairs';
import { computeHistoryStats } from '../lib/stats';
import { formatHebrewDate } from '../lib/format';
import { EmptyState } from './ui';

export function AnalysisView({
  players,
  history,
}: {
  players: Player[];
  history: MatchRecord[];
}) {
  const attendance = useMemo(() => computeAttendance(players, history), [players, history]);
  const pairs = useMemo(() => computePairChemistry(history), [history]);
  const stats = useMemo(() => computeHistoryStats(history), [history]);

  if (history.length === 0) {
    return (
      <EmptyState
        icon={<BarChart3 size={28} />}
        title="אין עדיין מספיק נתונים"
        hint="שמרו כמה הגרלות ועדכנו מי ניצח — כאן יופיעו מגמות נוכחות וכימיה משחקית."
      />
    );
  }

  return (
    <div className="space-y-4">
      <AttendanceSection report={attendance} />
      <PairSection report={pairs} />
      {stats.cancellers.length > 0 && <CancellersSection cancellers={stats.cancellers} />}
    </div>
  );
}

/* ------------------------- נוכחות לאורך זמן ------------------------- */

const CELL: Record<WeekStatus, { className: string; label: string }> = {
  played: { className: 'bg-emerald-500', label: 'שיחק' },
  cancelled: { className: 'bg-rose-500/70', label: 'ביטל' },
  absent: { className: 'bg-slate-800', label: 'לא הגיע' },
};

function AttendanceSection({ report }: { report: ReturnType<typeof computeAttendance> }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? report.players : report.players.slice(0, 12);

  return (
    <section className="card space-y-4 p-4">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-100">
          <CalendarX size={16} className="text-sky-400" />
          נוכחות לאורך זמן
        </h2>
        <p className="mt-0.5 text-[11px] text-slate-500">
          כל ריבוע הוא שבוע, מהאחרון (ימין) לישן ביותר. ירוק = שיחק · אדום = ביטל · אפור = לא הגיע.
        </p>
      </div>

      {(report.gone.length > 0 || report.slipping.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {report.gone.length > 0 && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3">
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-rose-300">
                <UserX size={12} />
                נעלמו — לא הגיעו הרבה זמן
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {report.gone.map((p) => (
                  <li
                    key={p.id}
                    className="rounded-lg bg-rose-500/15 px-2 py-1 text-[11px] font-semibold text-rose-200"
                  >
                    {p.name}
                    <span className="mr-1 font-mono opacity-80">{p.weeksSinceLast} שבועות</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {report.slipping.length > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-amber-300">
                <TrendingDown size={12} />
                מתחילים להתפוגג — היו קבועים ופחות מגיעים
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {report.slipping.map((p) => (
                  <li
                    key={p.id}
                    className="rounded-lg bg-amber-500/15 px-2 py-1 text-[11px] font-semibold text-amber-200"
                    title={`היה ${Math.round(p.earlierRate * 100)}% ועכשיו ${Math.round(p.recentRate * 100)}%`}
                  >
                    {p.name}
                    <span className="mr-1 font-mono opacity-80">
                      {Math.round(p.earlierRate * 100)}% ← {Math.round(p.recentRate * 100)}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <tbody className="divide-y divide-slate-800/60">
            {visible.map((p) => (
              <AttendanceRow key={p.id} player={p} weekDates={report.weekDates} />
            ))}
          </tbody>
        </table>
      </div>

      {report.players.length > 12 && (
        <button
          className="w-full rounded-lg py-1.5 text-[11px] font-semibold text-slate-400 transition hover:bg-slate-800/60 hover:text-slate-200"
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll ? 'הצגת 12 הראשונים' : `הצגת כל ${report.players.length} השחקנים`}
        </button>
      )}
    </section>
  );
}

function AttendanceRow({ player, weekDates }: { player: PlayerAttendance; weekDates: string[] }) {
  const tone =
    player.status === 'gone'
      ? 'text-rose-300'
      : player.status === 'slipping'
        ? 'text-amber-300'
        : player.status === 'never'
          ? 'text-slate-500'
          : 'text-slate-200';

  return (
    <tr>
      <td className={`max-w-[8rem] truncate py-1.5 pl-2 font-semibold ${tone}`}>{player.name}</td>
      <td className="py-1.5">
        <div className="flex gap-[3px]">
          {player.weeks.map((w, i) => (
            <span
              key={weekDates[i]}
              className={`h-4 w-4 shrink-0 rounded-sm ${CELL[w].className}`}
              title={`${formatHebrewDate(weekDates[i])} — ${CELL[w].label}`}
            />
          ))}
        </div>
      </td>
      <td className="w-24 py-1.5 pr-2 text-left font-mono text-[10px] whitespace-nowrap text-slate-500 tabular-nums">
        {player.playedCount}/{player.totalWeeks}
        {player.weeksSinceLast === null
          ? ' · אף פעם'
          : player.weeksSinceLast > 0 && ` · לפני ${player.weeksSinceLast}`}
      </td>
    </tr>
  );
}

/* ------------------------- כימיה משחקית ------------------------- */

function PairSection({ report }: { report: ReturnType<typeof computePairChemistry> }) {
  const enough = report.qualifiedPairs > 0;

  return (
    <section className="card space-y-4 p-4">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-100">
          <Sparkles size={16} className="text-violet-400" />
          כימיה משחקית — נלמדת מהתוצאות
        </h2>
        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
          לכל זוג ששיחק יחד, משווים את אחוז הניצחון שלהם יחד לאחוז שהיה צפוי לפי הביצועים האישיים.
          ההפרש הוא ה״אפקט״. נדרשים לפחות {MIN_GAMES_TOGETHER} משחקים משותפים.
        </p>
      </div>

      {!enough ? (
        <p className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-xs leading-relaxed text-slate-400">
          עוד אין מספיק נתונים. יש {report.resolvedMatches} משחקים עם תוצאה מעודכנת — צריך שיצטברו
          זוגות ששיחקו יחד לפחות {MIN_GAMES_TOGETHER} פעמים. עדכנו מי ניצח בכל שבוע וזה יתמלא לבד.
        </p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          <PairList
            title="עובדים טוב ביחד"
            icon={<TrendingUp size={12} />}
            tone="emerald"
            pairs={report.strong}
            empty="עוד לא נמצא זוג שמנצח יותר מהצפוי."
          />
          <PairList
            title="פחות מסתדרים ביחד"
            icon={<TrendingDown size={12} />}
            tone="rose"
            pairs={report.weak}
            empty="עוד לא נמצא זוג שמנצח פחות מהצפוי."
          />
        </div>
      )}

      {enough && (
        <p className="text-[10px] leading-relaxed text-slate-500">
          שימו לב למדגם: זוג עם {MIN_GAMES_TOGETHER} משחקים משותפים זה כיוון, לא הוכחה — ריחוף על
          המספרים מראה את הפירוט. שימו לב גם ששני שחקנים שתמיד משובצים יחד לא יופיעו כאן, כי אי אפשר
          להפריד בין התרומה המשותפת שלהם לביצועים האישיים.
        </p>
      )}
    </section>
  );
}

function PairList({
  title,
  icon,
  tone,
  pairs,
  empty,
}: {
  title: string;
  icon: React.ReactNode;
  tone: 'emerald' | 'rose';
  pairs: ReturnType<typeof computePairChemistry>['strong'];
  empty: string;
}) {
  const colors =
    tone === 'emerald'
      ? { border: 'border-emerald-500/30', bg: 'bg-emerald-500/5', text: 'text-emerald-300' }
      : { border: 'border-rose-500/30', bg: 'bg-rose-500/5', text: 'text-rose-300' };

  return (
    <div className={`rounded-xl border ${colors.border} ${colors.bg} p-3`}>
      <p className={`mb-2 flex items-center gap-1.5 text-[11px] font-bold ${colors.text}`}>
        {icon}
        {title}
      </p>

      {pairs.length === 0 ? (
        <p className="text-[11px] text-slate-500">{empty}</p>
      ) : (
        <ul className="space-y-1.5">
          {pairs.map((p) => (
            <li
              key={`${p.aId}-${p.bId}`}
              className="flex items-center gap-2 rounded-lg bg-slate-900/50 px-2.5 py-1.5 text-[11px]"
            >
              <Link2 size={11} className="shrink-0 text-slate-500" />
              <span className="min-w-0 flex-1 truncate font-semibold text-slate-200">
                {p.aName} · {p.bName}
              </span>
              <span
                className="shrink-0 font-mono text-[10px] text-slate-500 tabular-nums"
                title={
                  `ניצחו ${Math.round(p.winRate * 100)}% מהמשחקים יחד, צפוי היה ${Math.round(p.expected * 100)}%` +
                  ` · ${p.wins} ניצחונות${p.draws ? ` ו-${p.draws} תיקו` : ''} מתוך ${p.games}` +
                  ` · ${CONFIDENCE_LABEL[p.confidence]}`
                }
              >
                {Math.round(p.winRate * 100)}% מ-{p.games}
              </span>
              <span className={`w-12 shrink-0 text-left font-mono font-bold tabular-nums ${colors.text}`}>
                {p.effect > 0 ? '+' : ''}
                {Math.round(p.effect * 100)}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------------------------- ביטולים ---------------------------- */

function CancellersSection({
  cancellers,
}: {
  cancellers: ReturnType<typeof computeHistoryStats>['cancellers'];
}) {
  return (
    <section className="card p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-100">
        <UserX size={16} className="text-rose-400" />
        מי מבטל הכי הרבה
      </h2>
      <ul className="space-y-1.5">
        {cancellers.slice(0, 8).map((c) => (
          <li key={c.id} className="flex items-center gap-3 rounded-lg bg-slate-900/50 px-3 py-2 text-xs">
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
    </section>
  );
}
