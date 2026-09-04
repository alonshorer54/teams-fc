import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Scale, Undo2, X } from 'lucide-react';
import type { RatingChangeRecord } from '../types';
import { ROUNDS_PER_CHECK } from '../lib/ratingDrift';

/** תיאור קצר של תוצאת ערב, לפי הניקוד שהמד קיבל עליו */
const OUTCOME: Record<string, { label: string; className: string }> = {
  '1': { label: 'ניצחון', className: 'bg-emerald-500/15 text-emerald-300' },
  '0': { label: 'שקול', className: 'bg-slate-700/50 text-slate-300' },
  '-1': { label: 'הפסד', className: 'bg-rose-500/15 text-rose-300' },
};

/**
 * נפתחת בכל מחזור שלישי, אחרי שמסמנים את התוצאה — גם כשלא השתנה כלום.
 * "לא השתנה כלום" הוא תשובה בפני עצמה: הוא אומר שהקבוצות מאוזנות.
 */
export function RatingCheckPopup({
  changes,
  onUndo,
  onClose,
}: {
  changes: RatingChangeRecord[];
  onUndo: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // שחקן שכבר בקצה טווח הדירוג נצרך מהמד אבל לא זז בפועל
  const moved = changes.filter((c) => c.to !== c.from);

  // דרך ה-body, מאותה סיבה כמו בשאר החלונות: כרטיס עם backdrop-filter הוא
  // הבלוק המכיל של צאצאים fixed, וההודעה הייתה ננעלת בתוכו במקום על המסך
  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto overscroll-contain bg-slate-950/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0" onClick={onClose} aria-hidden />

      <div
        className={`animate-pop relative w-full max-w-lg overflow-hidden rounded-2xl border-2 bg-slate-900 shadow-2xl shadow-black/60 ${
          moved.length ? 'border-violet-500/50' : 'border-slate-700'
        }`}
      >
        <header
          className={`flex items-center justify-between gap-2 px-4 py-3 ${
            moved.length ? 'bg-violet-500/15' : 'bg-slate-800/60'
          }`}
        >
          <h3
            className={`flex items-center gap-2 text-sm font-bold ${
              moved.length ? 'text-violet-200' : 'text-slate-300'
            }`}
          >
            <Scale size={16} />
            בדיקת דירוגים — כל {ROUNDS_PER_CHECK} מחזורים
          </h3>
          <button
            onClick={onClose}
            aria-label="סגירה"
            className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-800 hover:text-white"
          >
            <X size={16} />
          </button>
        </header>

        <div className="max-h-[55vh] space-y-2 overflow-y-auto p-4">
          {moved.length === 0 ? (
            <p className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2.5 text-xs leading-relaxed text-slate-400">
              אף דירוג לא השתנה. אף אחד לא הגיע לסף — כלומר אין מי שמנצח או מפסיד באופן
              עקבי מספיק כדי להסיק שהדירוג שלו לא נכון.
            </p>
          ) : (
            <ul className="space-y-2">
              {moved.map((c) => {
                const up = c.to > c.from;
                return (
                  <li
                    key={c.playerId}
                    className={`rounded-xl border px-3 py-2 ${
                      up
                        ? 'border-emerald-500/30 bg-emerald-500/5'
                        : 'border-rose-500/30 bg-rose-500/5'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-100">
                        {c.name}
                      </span>
                      <span
                        dir="ltr"
                        className={`flex shrink-0 items-center gap-1.5 font-mono text-sm font-bold tabular-nums ${
                          up ? 'text-emerald-300' : 'text-rose-300'
                        }`}
                      >
                        {c.from.toFixed(1)}
                        <ArrowLeft size={12} className="rotate-180" />
                        {c.to.toFixed(1)}
                      </span>
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      {c.recent.map((score, i) => {
                        const o = OUTCOME[String(score)] ?? OUTCOME['0'];
                        return (
                          <span
                            key={i}
                            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${o.className}`}
                          >
                            {o.label}
                          </span>
                        );
                      })}
                      <span className="mr-1 font-mono text-[10px] text-slate-500 tabular-nums">
                        המד: {c.gauge > 0 ? '+' : ''}
                        {c.gauge}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="flex gap-2 border-t border-slate-800 p-3">
          <button className="btn-primary flex-1" onClick={onClose}>
            הבנתי
          </button>
          {moved.length > 0 && (
            <button className="btn-ghost" onClick={onUndo}>
              <Undo2 size={15} />
              ביטול
            </button>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}
