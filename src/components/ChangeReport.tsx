import { AlertTriangle, ArrowLeft, CheckCircle2, RotateCcw } from 'lucide-react';
import { TEAM_META } from '../types';
import { CRITERION_META } from '../lib/criteria';
import type { LineupDiff } from '../lib/diff';

/**
 * מוצג אחרי עריכה ידנית של הקבוצות: מה זזה, מה נשבר ומה השתפר
 * ביחס להגרלה המקורית.
 */
export function ChangeReport({ diff, onRevert }: { diff: LineupDiff; onRevert: () => void }) {
  if (!diff.changed) return null;

  const warnings = diff.issues.filter((i) => i.kind === 'warn');
  const improvements = diff.issues.filter((i) => i.kind === 'good');
  const worsened = diff.criteria.filter((c) => c.delta < -1);
  const improved = diff.criteria.filter((c) => c.delta > 1);

  const clean = warnings.length === 0 && worsened.length === 0;

  return (
    <div
      className={`card overflow-hidden border-2 ${
        clean ? 'border-emerald-500/40' : 'border-amber-500/50'
      }`}
    >
      <header
        className={`flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 ${
          clean ? 'bg-emerald-500/10' : 'bg-amber-500/10'
        }`}
      >
        <h3
          className={`flex items-center gap-2 text-sm font-bold ${
            clean ? 'text-emerald-300' : 'text-amber-300'
          }`}
        >
          {clean ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
          {clean ? 'השינויים שלכם לא יצרו בעיות' : 'שימו לב — השינויים יצרו בעיות'}
        </h3>

        <button className="btn-ghost !py-1.5 text-xs" onClick={onRevert}>
          <RotateCcw size={13} />
          חזרה להגרלה המקורית
        </button>
      </header>

      <div className="space-y-3 p-4">
        {/* מי זז */}
        <div>
          <p className="mb-1.5 text-[11px] font-bold text-slate-400">
            {diff.moved.length === 1 ? 'שחקן אחד הוזז' : `${diff.moved.length} שחקנים הוזזו`}
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {diff.moved.map((m) => (
              <li
                key={m.id}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/60 px-2.5 py-1 text-[11px] font-semibold text-slate-200"
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
        </div>

        {/* בעיות */}
        {warnings.length > 0 && (
          <ul className="space-y-1.5">
            {warnings.map((issue, i) => (
              <li
                key={i}
                className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-[11px] leading-relaxed text-amber-200"
              >
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                {issue.text}
              </li>
            ))}
          </ul>
        )}

        {/* שיפורים */}
        {improvements.length > 0 && (
          <ul className="space-y-1.5">
            {improvements.map((issue, i) => (
              <li
                key={i}
                className="flex items-start gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2 text-[11px] leading-relaxed text-emerald-200"
              >
                <CheckCircle2 size={12} className="mt-0.5 shrink-0" />
                {issue.text}
              </li>
            ))}
          </ul>
        )}

        {/* ציונים לפני/אחרי */}
        {(worsened.length > 0 || improved.length > 0) && (
          <div>
            <p className="mb-1.5 text-[11px] font-bold text-slate-400">ציוני הקריטריונים</p>
            <ul className="flex flex-wrap gap-1.5">
              {[...worsened, ...improved].map((c) => {
                const meta = CRITERION_META[c.id];
                const down = c.delta < 0;
                return (
                  <li
                    key={c.id}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${
                      down
                        ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                        : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                    }`}
                    title={`${meta.help}`}
                  >
                    {meta.emoji} {meta.label}
                    <span dir="ltr" className="font-mono tabular-nums">
                      {c.before} → {c.after}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {clean && diff.issues.length === 0 && (
          <p className="text-[11px] text-slate-400">
            לא נשברו קשרים, האיזון נשמר והקבוצות באותם גדלים.
          </p>
        )}
      </div>
    </div>
  );
}
