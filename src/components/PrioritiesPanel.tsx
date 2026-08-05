import { useState } from 'react';
import { ChevronDown, ChevronUp, ListOrdered, RotateCcw } from 'lucide-react';
import {
  CRITERION_META,
  DEFAULT_PRIORITIES,
  type CriterionId,
  type CriterionSetting,
} from '../lib/criteria';

/**
 * סדר העדיפויות של ההגרלה.
 * הקריטריון העליון מכריע; כל אחד מתחתיו נשקל פחות, ומשמש בעיקר לשבירת שוויון.
 */
export function PrioritiesPanel({
  priorities,
  onChange,
  /** קריטריונים שאין להם נתונים כרגע — מוצגים מושבתים */
  unavailable,
}: {
  priorities: CriterionSetting[];
  onChange: (next: CriterionSetting[]) => void;
  unavailable: Partial<Record<CriterionId, string>>;
}) {
  const [open, setOpen] = useState(false);

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= priorities.length) return;
    const next = [...priorities];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const toggle = (index: number) => {
    const next = priorities.map((p, i) => (i === index ? { ...p, enabled: !p.enabled } : p));
    onChange(next);
  };

  const activeSummary = priorities
    .filter((p) => p.enabled && !unavailable[p.id])
    .map((p) => CRITERION_META[p.id].label)
    .join(' ← ');

  return (
    <section className="card overflow-hidden">
      <button
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-right transition hover:bg-slate-800/40"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-100">
            <ListOrdered size={15} className="text-sky-400" />
            סדר עדיפויות בהגרלה
          </h3>
          <p className="mt-0.5 truncate text-[11px] text-slate-400">
            {activeSummary || 'לא נבחר אף קריטריון'}
          </p>
        </div>
        <ChevronDown
          size={18}
          className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="space-y-2 border-t border-slate-800/70 p-4">
          <p className="text-[11px] leading-relaxed text-slate-500">
            הקריטריון העליון מכריע. כל אחד מתחתיו נשקל פחות ומשמש בעיקר לשבירת שוויון בין חלוקות
            שקולות. אפשר לכבות כל קריטריון או לשנות את הסדר.
          </p>

          <ol className="space-y-1.5">
            {priorities.map((setting, index) => {
              const meta = CRITERION_META[setting.id];
              const blockedReason = unavailable[setting.id];
              const active = setting.enabled && !blockedReason;

              return (
                <li
                  key={setting.id}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition ${
                    active
                      ? 'border-slate-700 bg-slate-900/60'
                      : 'border-slate-800 bg-slate-950/40 opacity-60'
                  }`}
                >
                  <span
                    className={`flex size-6 shrink-0 items-center justify-center rounded-lg font-mono text-[11px] font-bold ${
                      active ? 'bg-sky-500/20 text-sky-300' : 'bg-slate-800 text-slate-500'
                    }`}
                  >
                    {index + 1}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-100">
                      <span>{meta.emoji}</span>
                      {meta.label}
                    </span>
                    <span className="block text-[10px] leading-relaxed text-slate-500">
                      {blockedReason ?? meta.help}
                    </span>
                  </span>

                  <label
                    className={`shrink-0 ${blockedReason ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                    title={blockedReason ?? (setting.enabled ? 'כיבוי הקריטריון' : 'הפעלת הקריטריון')}
                  >
                    <input
                      type="checkbox"
                      className="size-4 accent-emerald-500"
                      checked={active}
                      disabled={!!blockedReason}
                      onChange={() => toggle(index)}
                    />
                  </label>

                  <span className="flex shrink-0 flex-col">
                    <button
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      title="העלאה בסדר העדיפויות"
                      aria-label="העלאה בסדר העדיפויות"
                      className="rounded p-0.5 text-slate-500 transition hover:bg-slate-800 hover:text-white disabled:opacity-25 disabled:hover:bg-transparent"
                    >
                      <ChevronUp size={14} />
                    </button>
                    <button
                      onClick={() => move(index, 1)}
                      disabled={index === priorities.length - 1}
                      title="הורדה בסדר העדיפויות"
                      aria-label="הורדה בסדר העדיפויות"
                      className="rounded p-0.5 text-slate-500 transition hover:bg-slate-800 hover:text-white disabled:opacity-25 disabled:hover:bg-transparent"
                    >
                      <ChevronDown size={14} />
                    </button>
                  </span>
                </li>
              );
            })}
          </ol>

          <button
            className="btn-ghost w-full !py-1.5 text-xs"
            onClick={() => onChange(DEFAULT_PRIORITIES)}
          >
            <RotateCcw size={13} />
            חזרה לסדר ברירת המחדל
          </button>
        </div>
      )}
    </section>
  );
}
