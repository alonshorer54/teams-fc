import { useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  CheckCheck,
  ChevronDown,
  ClipboardPaste,
  Link2,
  Plus,
  TrendingDown,
  TrendingUp,
  UserPlus,
  UserX,
  X,
} from 'lucide-react';
import type { Player } from '../types';
import type { Substitution } from '../lib/storage';
import { formatHebrewDate } from '../lib/format';
import { RatingBadge } from './ui';
import { PasteListModal } from './PasteListModal';

const IDEAL_SIZE = 21; // 3 קבוצות × 7 שחקנים

/**
 * "המחזור הקרוב" — הרשימה של מי משחק השבוע.
 * נבנית מהדבקת רשימה או בסימון ידני, ומכאן מנהלים ביטולים והחלפות.
 */
export function RoundPanel({
  players,
  matchDate,
  selectedIds,
  cancelledIds,
  substitutions,
  streaks,
  onSetAll,
  onToggle,
  onCancel,
  onUncancel,
  onSubstitute,
}: {
  players: Player[];
  matchDate: string;
  selectedIds: string[];
  cancelledIds: string[];
  substitutions: Substitution[];
  streaks: Map<string, number>;
  onSetAll: (ids: string[]) => void;
  onToggle: (id: string) => void;
  onCancel: (id: string) => void;
  onUncancel: (id: string) => void;
  onSubstitute: (outId: string, inId: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const [pasteOpen, setPasteOpen] = useState(false);
  /** למי מהמבטלים פתוח כרגע בורר המחליף */
  const [replacingFor, setReplacingFor] = useState<string | null>(null);

  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const cancelled = useMemo(() => new Set(cancelledIds), [cancelledIds]);

  const byRating = (a: Player, b: Player) =>
    b.rating - a.rating || a.name.localeCompare(b.name, 'he');

  const playing = useMemo(
    () => players.filter((p) => selected.has(p.id)).sort(byRating),
    [players, selected],
  );
  const cancelledPlayers = useMemo(
    () => players.filter((p) => cancelled.has(p.id)).sort(byRating),
    [players, cancelled],
  );
  const bench = useMemo(
    () => players.filter((p) => !selected.has(p.id) && !cancelled.has(p.id)).sort(byRating),
    [players, selected, cancelled],
  );

  const count = playing.length;
  const status =
    count === IDEAL_SIZE
      ? { text: `${count} שחקנים — 3 קבוצות של 7 ✅`, tone: 'text-emerald-300' }
      : count < 3
        ? { text: `${count} שחקנים — צריך לפחות 3`, tone: 'text-rose-300' }
        : { text: `${count} שחקנים — חלוקה ל-${sizesText(count)}`, tone: 'text-amber-300' };

  return (
    <section className="card overflow-hidden">
      <button
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-right transition hover:bg-slate-800/40"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="min-w-0">
          <h2 className="truncate text-sm font-bold text-slate-100">
            המחזור הקרוב · {formatHebrewDate(matchDate)}
          </h2>
          <p className={`mt-0.5 text-xs font-semibold ${status.tone}`}>
            {status.text}
            {cancelledPlayers.length > 0 && (
              <span className="text-rose-300">
                {' '}
                ·{' '}
                {cancelledPlayers.length === 1
                  ? 'ביטול אחד'
                  : `${cancelledPlayers.length} ביטולים`}
              </span>
            )}
            {substitutions.length > 0 && (
              <span className="text-sky-300"> · {substitutions.length} החלפות</span>
            )}
          </p>
        </div>
        <ChevronDown
          size={18}
          className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="space-y-4 border-t border-slate-800/70 p-4">
          <p className="flex flex-wrap items-center gap-1 text-[11px] leading-relaxed text-slate-500">
            <UserX size={12} className="text-rose-400" /> = ביטל הגעה (נספר לו בהיסטוריה, ואפשר לבחור
            מחליף) ·<X size={12} /> = הסרה מהמחזור בלי לסמן ביטול
          </p>

          <div className="flex flex-wrap gap-2">
            <button className="btn-primary !py-1.5 text-xs" onClick={() => setPasteOpen(true)}>
              <ClipboardPaste size={14} />
              הדבקת רשימה מוואטסאפ
            </button>
            <button
              className="btn-ghost !py-1.5 text-xs"
              onClick={() => onSetAll(players.filter((p) => !cancelled.has(p.id)).map((p) => p.id))}
            >
              <CheckCheck size={14} />
              בחירת הכל
            </button>
            <button className="btn-ghost !py-1.5 text-xs" onClick={() => onSetAll([])}>
              <X size={14} />
              ניקוי המחזור
            </button>
          </div>

          {/* משחקים */}
          <Group
            title="משחקים"
            count={playing.length}
            tone="emerald"
            empty="עוד לא נבחר אף אחד. הדביקו רשימה או סמנו מלמטה."
          >
            {playing.map((p) => (
              <PlayerChip
                key={p.id}
                player={p}
                friendName={p.friendOf ? byId.get(p.friendOf)?.name : undefined}
                streak={streaks.get(p.id) ?? 0}
                tone="emerald"
                action={{
                  icon: <UserX size={13} />,
                  label: 'ביטל הגעה — נספר לו בהיסטוריה',
                  onClick: () => {
                    onCancel(p.id);
                    setReplacingFor(p.id);
                  },
                }}
                secondaryAction={{
                  icon: <X size={13} />,
                  label: 'הסרה מהמחזור בלי לסמן ביטול',
                  onClick: () => onToggle(p.id),
                }}
              />
            ))}
          </Group>

          {/* ביטולים */}
          {cancelledPlayers.length > 0 && (
            <Group title="ביטלו" count={cancelledPlayers.length} tone="rose">
              {cancelledPlayers.map((p) => {
                const sub = substitutions.find((s) => s.outId === p.id);
                const subName = sub ? byId.get(sub.inId)?.name : null;

                return (
                  <div key={p.id} className="w-full">
                    <PlayerChip
                      player={p}
                      tone="rose"
                      strikethrough
                      note={subName ? `הוחלף ב${subName}` : undefined}
                      action={{
                        icon: <ArrowLeftRight size={13} />,
                        label: subName ? 'שינוי המחליף' : 'בחירת מחליף',
                        onClick: () => setReplacingFor(replacingFor === p.id ? null : p.id),
                      }}
                      secondaryAction={{
                        icon: <X size={13} />,
                        label: 'ביטול הסימון — הוא כן מגיע',
                        onClick: () => {
                          onUncancel(p.id);
                          setReplacingFor(null);
                        },
                      }}
                    />

                    {replacingFor === p.id && (
                      <ReplacementPicker
                        target={p}
                        options={bench}
                        onPick={(inId) => {
                          onSubstitute(p.id, inId);
                          setReplacingFor(null);
                        }}
                        onClose={() => setReplacingFor(null)}
                      />
                    )}
                  </div>
                );
              })}
            </Group>
          )}

          {/* שאר המאגר */}
          <Group
            title="לא ברשימה"
            count={bench.length}
            tone="slate"
            empty="כל המאגר משובץ במחזור."
          >
            {bench.map((p) => (
              <PlayerChip
                key={p.id}
                player={p}
                friendName={p.friendOf ? byId.get(p.friendOf)?.name : undefined}
                streak={streaks.get(p.id) ?? 0}
                tone="slate"
                action={{
                  icon: <Plus size={13} />,
                  label: 'הוספה למחזור',
                  onClick: () => onToggle(p.id),
                }}
              />
            ))}
          </Group>
        </div>
      )}

      <PasteListModal
        open={pasteOpen}
        players={players}
        onClose={() => setPasteOpen(false)}
        onApply={(ids) => {
          onSetAll(ids);
          setPasteOpen(false);
        }}
      />
    </section>
  );
}

/* ------------------------------ בורר מחליף ------------------------------ */

function ReplacementPicker({
  target,
  options,
  onPick,
  onClose,
}: {
  target: Player;
  options: Player[];
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  // הכי קרובים בדירוג קודם — שומר על האיזון של המחזור
  const ranked = [...options].sort(
    (a, b) => Math.abs(a.rating - target.rating) - Math.abs(b.rating - target.rating),
  );

  return (
    <div className="mt-1.5 mr-3 rounded-xl border border-sky-500/30 bg-sky-500/5 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-bold text-sky-300">
          <UserPlus size={12} />
          מי מחליף את {target.name}?
        </p>
        <button className="text-[11px] text-slate-400 underline" onClick={onClose}>
          סגירה
        </button>
      </div>

      {ranked.length === 0 ? (
        <p className="text-[11px] text-slate-500">אין שחקנים פנויים מחוץ למחזור.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {ranked.slice(0, 12).map((p) => (
            <button
              key={p.id}
              onClick={() => onPick(p.id)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/60 px-2.5 py-1 text-[11px] font-semibold text-slate-200 transition hover:border-sky-500/50 hover:text-white"
              title={`דירוג ${p.rating.toFixed(1)} · פער של ${Math.abs(p.rating - target.rating).toFixed(1)}`}
            >
              {p.name}
              <span dir="ltr" className="font-mono text-[10px] text-slate-400">
                {p.rating.toFixed(1)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------------- עזרים -------------------------------- */

const TONES = {
  emerald: 'border-emerald-500/40 bg-emerald-500/10',
  rose: 'border-rose-500/30 bg-rose-500/5',
  slate: 'border-slate-800 bg-slate-900/40',
} as const;

const COUNT_TONES = {
  emerald: 'bg-emerald-500/20 text-emerald-300',
  rose: 'bg-rose-500/20 text-rose-300',
  slate: 'bg-slate-800 text-slate-300',
} as const;

function Group({
  title,
  count,
  tone,
  empty,
  children,
}: {
  title: string;
  count: number;
  tone: keyof typeof TONES;
  empty?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-2 flex items-center gap-2 text-[11px] font-bold tracking-wide text-slate-400">
        {title}
        <span className={`rounded px-1.5 font-mono text-[10px] tabular-nums ${COUNT_TONES[tone]}`}>
          {count}
        </span>
      </p>
      {count === 0 && empty ? (
        <p className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-3 text-[11px] text-slate-500">
          {empty}
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">{children}</div>
      )}
    </div>
  );
}

function PlayerChip({
  player,
  friendName,
  streak = 0,
  tone,
  strikethrough,
  note,
  action,
  secondaryAction,
}: {
  player: Player;
  friendName?: string;
  streak?: number;
  tone: keyof typeof TONES;
  strikethrough?: boolean;
  note?: string;
  action: { icon: React.ReactNode; label: string; onClick: () => void };
  secondaryAction?: { icon: React.ReactNode; label: string; onClick: () => void };
}) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-xl border px-2.5 py-1.5 ${TONES[tone]}`}
    >
      <span className="flex flex-col">
        <span className="flex items-center gap-1.5">
          <span
            className={`text-sm font-semibold ${
              strikethrough ? 'text-slate-400 line-through' : 'text-slate-100'
            }`}
          >
            {player.name}
          </span>
          {streak <= -2 && (
            <span
              className="inline-flex items-center gap-0.5 rounded bg-amber-500/20 px-1 font-mono text-[9px] font-bold text-amber-300"
              title={`סיים למטה ${Math.abs(streak)} שבועות ברצף — שווה לחזק אותו`}
            >
              <TrendingDown size={8} />
              {Math.abs(streak)}
            </span>
          )}
          {streak >= 2 && (
            <span
              className="inline-flex items-center gap-0.5 rounded bg-emerald-500/20 px-1 font-mono text-[9px] font-bold text-emerald-300"
              title={`סיים למעלה ${streak} שבועות ברצף`}
            >
              <TrendingUp size={8} />
              {streak}
            </span>
          )}
        </span>
        {(friendName || note) && (
          <span className="flex items-center gap-1 text-[10px] text-slate-500">
            {friendName && (
              <>
                <Link2 size={9} />
                חבר של {friendName}
              </>
            )}
            {note && <span className="text-sky-300">{note}</span>}
          </span>
        )}
      </span>

      <RatingBadge rating={player.rating} size="sm" />

      {/* p-2 כדי שיהיה נוח ללחוץ באצבע בטלפון */}
      <button
        onClick={action.onClick}
        title={action.label}
        aria-label={action.label}
        className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-700/60 hover:text-white"
      >
        {action.icon}
      </button>

      {secondaryAction && (
        <button
          onClick={secondaryAction.onClick}
          title={secondaryAction.label}
          aria-label={secondaryAction.label}
          className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-700/60 hover:text-white"
        >
          {secondaryAction.icon}
        </button>
      )}
    </span>
  );
}

function sizesText(total: number): string {
  const base = Math.floor(total / 3);
  const rest = total % 3;
  return [base + (rest > 0 ? 1 : 0), base + (rest > 1 ? 1 : 0), base].join(' / ');
}
