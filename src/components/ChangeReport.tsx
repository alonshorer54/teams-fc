import { AlertTriangle, CheckCircle2, Link2, RotateCcw } from 'lucide-react';
import type { LineupDiff } from '../lib/diff';

/**
 * מוצג אחרי עריכה ידנית של הקבוצות: רק מה שמשנה את המשחק — עמדות, איזון,
 * גדלים ואילוצי השבוע. קשרים שנשברו נספרים בשורה אחת, ומי זז רואים בכרטיסים.
 */
export function ChangeReport({ diff, onRevert }: { diff: LineupDiff; onRevert: () => void }) {
  if (!diff.changed) return null;

  const major = diff.issues.filter((i) => !i.minor);
  const minor = diff.issues.filter((i) => i.minor);
  const clean = major.length === 0;

  return (
    <div
      className={`card overflow-hidden border ${
        clean ? 'border-emerald-500/30' : 'border-amber-500/40'
      }`}
    >
      <header
        className={`flex flex-wrap items-center justify-between gap-2 px-4 py-2 ${
          clean ? 'bg-emerald-500/10' : 'bg-amber-500/10'
        }`}
      >
        <h3
          className={`flex items-center gap-2 text-sm font-bold ${
            clean ? 'text-emerald-300' : 'text-amber-300'
          }`}
        >
          {clean ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
          {clean ? 'העריכה לא יצרה בעיות משמעותיות' : 'שימו לב לעריכה'}
          <span className="text-[11px] font-semibold text-slate-400">
            · {diff.moved.length === 1 ? 'שחקן אחד הוזז' : `${diff.moved.length} שחקנים הוזזו`}
          </span>
        </h3>

        <button className="btn-ghost !py-1 text-xs" onClick={onRevert}>
          <RotateCcw size={13} />
          חזרה להגרלה המקורית
        </button>
      </header>

      {(major.length > 0 || minor.length > 0) && (
        <div className="space-y-1 px-4 py-2.5">
          {major.map((issue, i) => (
            <p key={i} className="flex items-start gap-2 text-xs leading-relaxed text-amber-200">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              {issue.text}
            </p>
          ))}
          {minor.length > 0 && (
            // סגור כברירת מחדל: מספיק לדעת כמה, ומי שרוצה את השמות לוחץ
            <details className="text-[11px] text-slate-400">
              <summary className="flex cursor-pointer list-none items-center gap-2">
                <Link2 size={11} className="shrink-0" />
                {minor.length === 1
                  ? 'קשר אחד בין שחקנים נשבר'
                  : `${minor.length} קשרים בין שחקנים נשברו`}
                <span className="underline">פירוט</span>
              </summary>
              <ul className="mt-1 space-y-0.5 ps-5">
                {minor.map((issue, i) => (
                  <li key={i}>{issue.text}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
