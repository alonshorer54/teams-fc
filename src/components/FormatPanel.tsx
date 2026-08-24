import { useState } from 'react';
import { ChevronDown, LayoutGrid, Plus, UserPlus, X } from 'lucide-react';
import { TEAM_COUNT_OPTIONS, newFillerId, type Filler } from '../types';
import { missingForEvenTeams, teamSizeList } from '../lib/balance';
import { RatingBadge } from './ui';

/** דירוג ברירת המחדל למשלים — אמצע הסולם, כלומר שחקן ממוצע */
const DEFAULT_FILLER_RATING = 3;

/** ריבוי בעברית: "שחקן אחד" מול "3 שחקנים" */
const count = (n: number, one: string, many: string) => (n === 1 ? one : `${n} ${many}`);

/**
 * "מבנה החלוקה" — לכמה קבוצות מחלקים, ומי ממלא מקום כשחסר שחקן.
 * הגדלים עצמם נגזרים מכמות השחקנים: החלוקה תמיד שווה ככל האפשר.
 */
export function FormatPanel({
  teamCount,
  fillers,
  playerCount,
  onChangeTeamCount,
  onSetFillers,
  notify,
}: {
  teamCount: number;
  fillers: Filler[];
  /** כמה שחקנים אמיתיים נבחרו למחזור (בלי משלימים) */
  playerCount: number;
  onChangeTeamCount: (teamCount: number) => void;
  onSetFillers: (fillers: Filler[]) => void;
  notify: (msg: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const total = playerCount + fillers.length;
  const missing = missingForEvenTeams(total, teamCount);

  const sizes = teamSizeList(total, teamCount);
  const even = missing === 0;
  const summary =
    total === 0
      ? 'עוד לא נבחרו שחקנים'
      : `${teamCount} קבוצות של ${even ? sizes[0] : sizes.join(' / ')}`;

  const addFillers = (howMany: number) => {
    const additions: Filler[] = Array.from({ length: howMany }, (_, i) => ({
      id: newFillerId(),
      // ממוספרים לפי הסדר, כדי שיהיו מובחנים זה מזה על המסך
      name: `משלים ${fillers.length + i + 1}`,
      rating: DEFAULT_FILLER_RATING,
    }));
    onSetFillers([...fillers, ...additions]);
  };

  return (
    <section className="card overflow-hidden">
      <button
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-right transition hover:bg-slate-800/40"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 truncate text-sm font-bold text-slate-100">
            <LayoutGrid size={15} className="shrink-0 text-emerald-400" />
            מבנה החלוקה
          </h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs font-semibold text-slate-400">
            <span>{summary}</span>
            {fillers.length > 0 && (
              <span className="text-violet-300">
                · כולל {count(fillers.length, 'משלים אחד', 'משלימים')}
              </span>
            )}
            {missing > 0 && (
              <span className="text-amber-300">
                · חסר {count(missing, 'שחקן אחד', 'שחקנים')} לקבוצות שוות
              </span>
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
          {/* מספר הקבוצות */}
          <div>
            <p className="mb-1.5 text-[10px] font-bold tracking-wide text-slate-400">
              לכמה קבוצות מחלקים
            </p>
            <div className="flex gap-2">
              {TEAM_COUNT_OPTIONS.map((n) => (
                <button
                  key={n}
                  onClick={() => onChangeTeamCount(n)}
                  className={`flex-1 cursor-pointer rounded-xl border px-3 py-2.5 text-sm font-bold transition ${
                    teamCount === n
                      ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                      : 'border-slate-700 bg-slate-800/40 text-slate-400 hover:text-white'
                  }`}
                >
                  {n} קבוצות
                  <span className="mr-1.5 text-[10px] font-semibold opacity-70">
                    {n === 2 ? 'לבן · שחור' : 'לבן · שחור · צבעוני'}
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
              הגדלים נקבעים לפי כמות השחקנים — החלוקה תמיד שווה ככל האפשר.
              את הצבעים אפשר להחליף אחרי ההגרלה, בכפתור הפלטה שעל כל קבוצה.
            </p>
          </div>

          {/* משלימים */}
          <div className="border-t border-slate-800/70 pt-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-bold tracking-wide text-slate-400">
                שחקנים משלימים
                <span className="mr-1.5 rounded bg-violet-500/20 px-1.5 font-mono text-[10px] text-violet-300 tabular-nums">
                  {fillers.length}
                </span>
              </p>

              {missing > 0 && (
                <button
                  className="btn-primary !py-1.5 text-xs"
                  onClick={() => {
                    addFillers(missing);
                    notify(`נוסף ${count(missing, 'משלים אחד', 'משלימים')} — אפשר לשנות את הדירוג`);
                  }}
                >
                  <UserPlus size={13} />
                  השלמה ל-{teamCount} קבוצות של {(total + missing) / teamCount}
                </button>
              )}
              <button className="btn-ghost !py-1.5 text-xs" onClick={() => addFillers(1)}>
                <Plus size={13} />
                הוספת משלים
              </button>
            </div>

            <p className="mb-2 text-[11px] leading-relaxed text-slate-500">
              משלים הוא שחקן דמה למשחק הזה בלבד: הוא נכנס להגרלה לפי הדירוג שתיתנו לו
              ונשמר בכוחות של הערב, אבל לא נכנס למאגר השחקנים ולא נספר בסטטיסטיקות.
            </p>

            {fillers.length === 0 ? (
              <p className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-3 text-[11px] text-slate-500">
                אין משלימים. הוסיפו כשחסר שחקן כדי להשלים את הקבוצות.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {fillers.map((f) => (
                  <li
                    key={f.id}
                    className="flex flex-wrap items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/5 px-2.5 py-2"
                  >
                    <input
                      className="input !w-32 !py-1 text-sm"
                      value={f.name}
                      aria-label="שם המשלים"
                      onChange={(e) =>
                        onSetFillers(
                          fillers.map((x) =>
                            x.id === f.id ? { ...x, name: e.target.value } : x,
                          ),
                        )
                      }
                    />

                    <div className="flex items-center gap-1.5">
                      <label
                        className="text-[10px] font-semibold text-slate-400"
                        htmlFor={`rating-${f.id}`}
                      >
                        דירוג
                      </label>
                      <input
                        id={`rating-${f.id}`}
                        type="range"
                        min={1}
                        max={5}
                        step={0.1}
                        value={f.rating}
                        className="w-28 accent-violet-500"
                        onChange={(e) =>
                          onSetFillers(
                            fillers.map((x) =>
                              x.id === f.id ? { ...x, rating: Number(e.target.value) } : x,
                            ),
                          )
                        }
                      />
                      <RatingBadge rating={f.rating} size="sm" />
                    </div>

                    <button
                      className="mr-auto rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-500/15 hover:text-rose-300"
                      title="הסרת המשלים"
                      aria-label={`הסרת ${f.name}`}
                      onClick={() => onSetFillers(fillers.filter((x) => x.id !== f.id))}
                    >
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
