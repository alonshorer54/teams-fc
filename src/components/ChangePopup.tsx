import { useEffect } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, Undo2, X } from 'lucide-react';
import { TEAM_META } from '../types';
import { CRITERION_META } from '../lib/criteria';
import type { LineupDiff } from '../lib/diff';

/**
 * נפתחת אחרי כל שינוי ידני בכוחות ומסבירה מה הפעולה הזו עשתה.
 * נשארת על המסך עד שסוגרים אותה — בכוונה, כדי שלא תתפספס.
 */
export function ChangePopup({
  diff,
  onUndo,
  onClose,
}: {
  diff: LineupDiff;
  onUndo: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const warnings = diff.issues.filter((i) => i.kind === 'warn');
  const improvements = diff.issues.filter((i) => i.kind === 'good');
  const deltas = diff.criteria.filter((c) => Math.abs(c.delta) >= 1);
  const clean = warnings.length === 0;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0" onClick={onClose} aria-hidden />

      <div
        className={`animate-pop relative w-full max-w-lg overflow-hidden rounded-2xl border-2 bg-slate-900 shadow-2xl shadow-black/60 ${
          clean ? 'border-emerald-500/50' : 'border-amber-500/60'
        }`}
      >
        <header
          className={`flex items-center justify-between gap-2 px-4 py-3 ${
            clean ? 'bg-emerald-500/15' : 'bg-amber-500/15'
          }`}
        >
          <h3
            className={`flex items-center gap-2 text-sm font-bold ${
              clean ? 'text-emerald-300' : 'text-amber-300'
            }`}
          >
            {clean ? <AlertTriangle size={16} className="opacity-0" /> : <AlertTriangle size={16} />}
            {clean ? 'השינוי בוצע — לא נוצרו בעיות' : 'השינוי בוצע — שימו לב לבעיות'}
          </h3>
          <button
            onClick={onClose}
            aria-label="סגירה"
            className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-800 hover:text-white"
          >
            <X size={16} />
          </button>
        </header>

        <div className="max-h-[55vh] space-y-2.5 overflow-y-auto p-4">
          <ul className="flex flex-wrap gap-1.5">
            {diff.moved.map((m) => (
              <li
                key={m.id}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950/60 px-2.5 py-1 text-[11px] font-semibold text-slate-100"
              >
                {m.name}
                <span className="flex items-center gap-1 text-slate-400">
                  {TEAM_META[m.from].name}
                  <ArrowLeft size={10} />
                  {TEAM_META[m.to].name}
                </span>
              </li>
            ))}
          </ul>

          {warnings.map((issue, i) => (
            <p
              key={`w${i}`}
              className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-200"
            >
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              {issue.text}
            </p>
          ))}

          {improvements.map((issue, i) => (
            <p
              key={`g${i}`}
              className="flex items-start gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs leading-relaxed text-emerald-200"
            >
              <CheckCircle2 size={13} className="mt-0.5 shrink-0" />
              {issue.text}
            </p>
          ))}

          {warnings.length === 0 && improvements.length === 0 && (
            <p className="px-1 text-xs text-slate-400">
              לא נשברו קשרים והאיזון כמעט לא זז.
            </p>
          )}

          {deltas.length > 0 && (
            <ul className="flex flex-wrap gap-1.5 pt-0.5">
              {deltas.map((c) => {
                const down = c.delta < 0;
                return (
                  <li
                    key={c.id}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] font-semibold ${
                      down
                        ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                        : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                    }`}
                  >
                    {CRITERION_META[c.id].emoji} {CRITERION_META[c.id].label}
                    <span dir="ltr" className="font-mono tabular-nums">
                      {c.before} → {c.after}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="flex gap-2 border-t border-slate-800 p-3">
          <button className="btn-primary flex-1" onClick={onClose}>
            סגירה
          </button>
          <button className="btn-ghost" onClick={onUndo}>
            <Undo2 size={14} />
            ביטול השינוי
          </button>
        </footer>
      </div>
    </div>
  );
}
