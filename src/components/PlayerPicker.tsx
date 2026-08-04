import { useMemo, useState } from 'react';
import {
  CheckCheck,
  ChevronDown,
  ClipboardPaste,
  Link2,
  Square,
  SquareCheck,
  UserX,
  X,
} from 'lucide-react';
import type { Player } from '../types';
import { RatingBadge } from './ui';
import { PasteListModal } from './PasteListModal';

const IDEAL_SIZE = 21; // 3 קבוצות × 7 שחקנים

export function PlayerPicker({
  players,
  selectedIds,
  cancelledIds,
  onToggle,
  onSetAll,
  onToggleCancelled,
}: {
  players: Player[];
  selectedIds: string[];
  cancelledIds: string[];
  onToggle: (id: string) => void;
  onSetAll: (ids: string[]) => void;
  onToggleCancelled: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const [pasteOpen, setPasteOpen] = useState(false);

  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const cancelled = useMemo(() => new Set(cancelledIds), [cancelledIds]);
  const nameById = useMemo(() => new Map(players.map((p) => [p.id, p.name])), [players]);

  const sorted = useMemo(
    () => [...players].sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name, 'he')),
    [players],
  );

  const count = selectedIds.length;
  const avg = count
    ? players.filter((p) => selected.has(p.id)).reduce((s, p) => s + p.rating, 0) / count
    : 0;

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
        <div>
          <h2 className="text-sm font-bold text-slate-100">מי משחק השבוע?</h2>
          <p className={`mt-0.5 text-xs font-semibold ${status.tone}`}>
            {status.text}
            {cancelledIds.length > 0 && (
              <span className="text-rose-300">
                {' '}
                · {cancelledIds.length === 1 ? 'ביטול אחד' : `${cancelledIds.length} ביטולים`}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {count > 0 && (
            <span dir="ltr" className="hidden font-mono text-xs text-slate-400 tabular-nums sm:block">
              ⌀ {avg.toFixed(2)}
            </span>
          )}
          <ChevronDown
            size={18}
            className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-800/70 p-4">
          <div className="mb-3 flex flex-wrap gap-2">
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
              ניקוי בחירה
            </button>
          </div>

          <p className="mb-3 flex flex-wrap items-center gap-1 text-[11px] leading-relaxed text-slate-500">
            לחיצה על שחקן מסמנת שהוא משחק. לחיצה על
            <UserX size={12} className="inline text-rose-400" />
            מסמנת שהוא אישר וביטל — הוא יורד מהרשימה, והביטול נספר לו בהיסטוריה.
          </p>

          <ul className="grid max-h-80 gap-1.5 overflow-y-auto pl-1 sm:grid-cols-2 xl:grid-cols-3">
            {sorted.map((p) => {
              const isOn = selected.has(p.id);
              const isCancelled = cancelled.has(p.id);
              const friend = p.friendOf ? nameById.get(p.friendOf) : null;

              return (
                <li key={p.id} className="flex gap-1">
                  <button
                    onClick={() => onToggle(p.id)}
                    disabled={isCancelled}
                    className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border px-3 py-2 text-right transition ${
                      isCancelled
                        ? 'border-rose-500/30 bg-rose-500/5 opacity-60'
                        : isOn
                          ? 'border-emerald-500/50 bg-emerald-500/10'
                          : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
                    }`}
                  >
                    {isCancelled ? (
                      <UserX size={16} className="shrink-0 text-rose-400" />
                    ) : isOn ? (
                      <SquareCheck size={16} className="shrink-0 text-emerald-400" />
                    ) : (
                      <Square size={16} className="shrink-0 text-slate-600" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block truncate text-sm font-semibold ${
                          isCancelled ? 'text-slate-400 line-through' : 'text-slate-100'
                        }`}
                      >
                        {p.name}
                      </span>
                      {friend && (
                        <span className="flex items-center gap-1 truncate text-[10px] text-slate-500">
                          <Link2 size={9} /> חבר של {friend}
                        </span>
                      )}
                    </span>
                    <RatingBadge rating={p.rating} size="sm" />
                  </button>

                  <button
                    onClick={() => onToggleCancelled(p.id)}
                    title={isCancelled ? 'ביטול הסימון' : 'סימון שהשחקן ביטל הגעה'}
                    className={`shrink-0 rounded-xl border px-2 transition ${
                      isCancelled
                        ? 'border-rose-500/50 bg-rose-500/20 text-rose-300'
                        : 'border-slate-800 text-slate-600 hover:border-rose-500/40 hover:text-rose-400'
                    }`}
                  >
                    <UserX size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
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

function sizesText(total: number): string {
  const base = Math.floor(total / 3);
  const rest = total % 3;
  return [base + (rest > 0 ? 1 : 0), base + (rest > 1 ? 1 : 0), base].join(' / ');
}
