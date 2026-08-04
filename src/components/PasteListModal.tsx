import { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, ClipboardPaste, HelpCircle } from 'lucide-react';
import type { Player } from '../types';
import { parseNameList } from '../lib/parseNames';
import { Modal } from './ui';

/**
 * מדביקים טקסט חופשי מהקבוצה בוואטסאפ (סקר, רשימה ממוספרת, שמות בשורות)
 * והאפליקציה מזהה מי מהשחקנים במאגר מופיע בו.
 */
export function PasteListModal({
  open,
  players,
  onApply,
  onClose,
}: {
  open: boolean;
  players: Player[];
  onApply: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [picks, setPicks] = useState<Record<string, string>>({}); // raw -> playerId

  const result = useMemo(() => parseNameList(text, players), [text, players]);

  const selectedIds = useMemo(() => {
    const ids = result.matched.map((m) => m.player!.id);
    for (const chosen of Object.values(picks)) if (chosen) ids.push(chosen);
    return [...new Set(ids)];
  }, [result, picks]);

  const close = () => {
    setText('');
    setPicks({});
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="הדבקת רשימה מוואטסאפ"
      icon={<ClipboardPaste size={20} className="text-emerald-400" />}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-4">
        <div>
          <label className="label" htmlFor="paste-area">
            העתיקו את השמות מהקבוצה והדביקו כאן
          </label>
          <textarea
            id="paste-area"
            className="input h-36 resize-y font-mono text-[13px] leading-relaxed"
            dir="rtl"
            placeholder={'1. יוסי כהן\n2. דני\n3. משה ✅\nאבי לוי'}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <p className="mt-1.5 text-[11px] text-slate-500">
            לא משנה איך זה מסודר — מספור, מקפים, אמוג'י או פסיקים. גם שם פרטי בלבד יזוהה, כל עוד הוא
            ייחודי במאגר.
          </p>
        </div>

        {text.trim() && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-emerald-300">
                <CheckCircle2 size={13} />
                זוהו {selectedIds.length}
              </span>
              {result.ambiguous.length > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-amber-300">
                  <HelpCircle size={13} />
                  {result.ambiguous.length} דו-משמעיים
                </span>
              )}
              {result.unmatched.length > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/50 px-2.5 py-1.5 text-slate-400">
                  <AlertCircle size={13} />
                  {result.unmatched.length} לא זוהו
                </span>
              )}
            </div>

            {result.matched.length > 0 && (
              <div className="max-h-36 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                <ul className="flex flex-wrap gap-1.5">
                  {result.matched.map((m) => (
                    <li
                      key={m.raw}
                      className="rounded-lg bg-emerald-500/15 px-2 py-1 text-[11px] font-semibold text-emerald-200"
                      title={m.exact ? 'התאמה מדויקת' : `זוהה מתוך "${m.raw}"`}
                    >
                      {m.player!.name}
                      {!m.exact && <span className="text-emerald-400/60"> ≈</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.ambiguous.map((a) => (
              <div key={a.raw} className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                <p className="mb-2 text-xs text-amber-200">
                  למי התכוונת ב־<b>"{a.raw}"</b>?
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {a.options.map((o) => (
                    <button
                      key={o.id}
                      onClick={() =>
                        setPicks((prev) => ({ ...prev, [a.raw]: prev[a.raw] === o.id ? '' : o.id }))
                      }
                      className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
                        picks[a.raw] === o.id
                          ? 'border-emerald-500/60 bg-emerald-500/20 text-emerald-200'
                          : 'border-slate-700 bg-slate-800/60 text-slate-300 hover:border-slate-600'
                      }`}
                    >
                      {o.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {result.unmatched.length > 0 && (
              <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                <p className="mb-2 text-[11px] text-slate-400">
                  לא נמצאו במאגר — אם מישהו מהם משחק, הוסיפו אותו בלשונית "שחקנים":
                </p>
                <ul className="flex flex-wrap gap-1.5">
                  {result.unmatched.map((u) => (
                    <li key={u.raw} className="rounded-lg bg-slate-800 px-2 py-1 text-[11px] text-slate-400">
                      {u.raw}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            className="btn-primary flex-1"
            onClick={() => onApply(selectedIds)}
            disabled={selectedIds.length === 0}
          >
            סימון {selectedIds.length} השחקנים שזוהו
          </button>
          <button className="btn-ghost" onClick={close}>
            ביטול
          </button>
        </div>
      </div>
    </Modal>
  );
}
