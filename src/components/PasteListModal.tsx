import { useMemo, useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, ClipboardPaste, EyeOff, HelpCircle, UserPlus } from 'lucide-react';
import type { Player } from '../types';
import { parseNameList } from '../lib/parseNames';
import { Modal } from './ui';

export interface NewPlayerDraft {
  name: string;
  rating: number;
}

const RATING_OPTIONS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

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
  /** מי שזוהה, ומי שצריך להוסיף למאגר לפני שמסמנים אותו */
  onApply: (ids: string[], newPlayers: NewPlayerDraft[]) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [picks, setPicks] = useState<Record<string, string>>({}); // raw -> playerId
  const [fresh, setFresh] = useState<Record<string, NewPlayerDraft>>({}); // raw -> שחקן חדש

  const result = useMemo(() => parseNameList(text, players), [text, players]);

  const selectedIds = useMemo(() => {
    const ids = result.matched.map((m) => m.player.id);
    // רק בחירות לשורות שעדיין בטקסט — שורה שנמחקה לא משאירה אחריה שחקן מסומן
    for (const { raw } of [...result.ambiguous, ...result.unmatched]) {
      if (picks[raw]) ids.push(picks[raw]);
    }
    return [...new Set(ids)];
  }, [result, picks]);

  const existingNames = useMemo(() => new Set(players.map((p) => p.name.trim())), [players]);
  const newPlayers = useMemo(() => {
    const seen = new Set<string>();
    const out: NewPlayerDraft[] = [];
    for (const u of result.unmatched) {
      const d = fresh[u.raw];
      const name = d?.name.trim();
      if (!name || existingNames.has(name) || seen.has(name)) continue;
      seen.add(name);
      out.push({ name, rating: d.rating });
    }
    return out;
  }, [result, fresh, existingNames]);

  const total = selectedIds.length + newPlayers.length;
  const skippedCount = result.skipped.headers.length + result.skipped.waiting.length;
  const openLines =
    result.ambiguous.filter((a) => !picks[a.raw]).length +
    result.unmatched.filter((u) => !picks[u.raw] && !fresh[u.raw]).length;

  const pick = (raw: string, id: string) => {
    setPicks((prev) => ({ ...prev, [raw]: prev[raw] === id ? '' : id }));
    setFresh((prev) => {
      const next = { ...prev };
      delete next[raw];
      return next;
    });
  };

  const toggleFresh = (raw: string) => {
    setFresh((prev) => {
      const next = { ...prev };
      if (next[raw]) delete next[raw];
      else next[raw] = { name: raw, rating: 3 };
      return next;
    });
    setPicks((prev) => ({ ...prev, [raw]: '' }));
  };

  const reset = () => {
    setText('');
    setPicks({});
    setFresh({});
  };

  const close = () => {
    reset();
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
            העתיקו את ההודעה מהקבוצה והדביקו כאן
          </label>
          <textarea
            id="paste-area"
            className="input h-36 resize-y font-mono text-[13px] leading-relaxed"
            dir="rtl"
            placeholder={'כדורגל ברביעי ב20:30:\n1. יוסי כהן\n2. דני\n\nממתינים:\n1. משה'}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <p className="mt-1.5 text-[11px] text-slate-500">
            אפשר להדביק את כל ההודעה: הכותרת ורשימת הממתינים מדולגות לבד. כשיש מספור — נספרות רק
            השורות הממוספרות.
          </p>
        </div>

        {text.trim() && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-emerald-300">
                <CheckCircle2 size={13} />
                זוהו {selectedIds.length}
              </span>
              {newPlayers.length > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 px-2.5 py-1.5 text-sky-300">
                  <UserPlus size={13} />
                  {newPlayers.length === 1 ? 'שחקן חדש' : `${newPlayers.length} חדשים`}
                </span>
              )}
              {openLines > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-amber-300">
                  <HelpCircle size={13} />
                  {openLines} מחכים לבחירה
                </span>
              )}
              {skippedCount > 0 && (
                <span
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/50 px-2.5 py-1.5 text-slate-400"
                  title={[...result.skipped.headers, ...result.skipped.waiting].join('\n')}
                >
                  <EyeOff size={13} />
                  דולגו {skippedCount}
                  {result.skipped.waiting.length > 0 && ` (${result.skipped.waiting.length} ממתינים)`}
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
                      {m.player.name}
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
                    <Choice key={o.id} on={picks[a.raw] === o.id} onClick={() => pick(a.raw, o.id)}>
                      {o.name}
                    </Choice>
                  ))}
                </div>
              </div>
            ))}

            {result.unmatched.map((u) => {
              const draft = fresh[u.raw];
              const name = draft?.name.trim() ?? '';
              const clash = !!draft && existingNames.has(name);
              return (
                <div key={u.raw} className="rounded-xl border border-slate-700 bg-slate-950/50 p-3">
                  <p className="mb-2 flex items-center gap-1.5 text-xs text-slate-300">
                    <AlertCircle size={13} className="shrink-0 text-slate-500" />
                    <span>
                      <b>"{u.raw}"</b> לא נמצא במאגר.
                      {u.suggestions.length > 0 ? ' אולי התכוונת ל:' : ''}
                    </span>
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {u.suggestions.map((o) => (
                      <Choice key={o.id} on={picks[u.raw] === o.id} onClick={() => pick(u.raw, o.id)}>
                        {o.name}
                      </Choice>
                    ))}
                    <Choice on={!!draft} onClick={() => toggleFresh(u.raw)} tone="sky">
                      <UserPlus size={11} className="inline" /> שחקן חדש
                    </Choice>
                  </div>

                  {draft && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <input
                        className="input min-w-0 flex-1 py-1.5 text-xs"
                        value={draft.name}
                        aria-label="שם השחקן החדש"
                        onChange={(e) =>
                          setFresh((prev) => ({ ...prev, [u.raw]: { ...draft, name: e.target.value } }))
                        }
                      />
                      <label className="flex items-center gap-1.5 text-[11px] text-slate-400">
                        דירוג
                        <select
                          className="input w-20 py-1.5 text-center font-mono text-xs"
                          value={draft.rating}
                          onChange={(e) =>
                            setFresh((prev) => ({
                              ...prev,
                              [u.raw]: { ...draft, rating: Number(e.target.value) },
                            }))
                          }
                        >
                          {RATING_OPTIONS.map((r) => (
                            <option key={r} value={r}>
                              {r.toFixed(1)}
                            </option>
                          ))}
                        </select>
                      </label>
                      {(clash || !name) && (
                        <p className="w-full text-[11px] text-rose-300">
                          {clash ? 'כבר יש שחקן בשם הזה — בחרו אותו מהרשימה או שנו את השם' : 'חסר שם'}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            className="btn-primary flex-1"
            onClick={() => {
              onApply(selectedIds, newPlayers);
              // אחרת בחירות של השבוע הזה מחכות בפעם הבאה שפותחים את החלון
              reset();
            }}
            disabled={total === 0}
          >
            {newPlayers.length === 0
              ? `סימון ${total} השחקנים שזוהו`
              : newPlayers.length === 1
                ? `סימון ${total} השחקנים (אחד חדש יתווסף למאגר)`
                : `סימון ${total} השחקנים (${newPlayers.length} חדשים יתווספו למאגר)`}
          </button>
          <button className="btn-ghost" onClick={close}>
            ביטול
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Choice({
  on,
  onClick,
  tone = 'emerald',
  children,
}: {
  on: boolean;
  onClick: () => void;
  tone?: 'emerald' | 'sky';
  children: ReactNode;
}) {
  const active =
    tone === 'sky'
      ? 'border-sky-500/60 bg-sky-500/20 text-sky-200'
      : 'border-emerald-500/60 bg-emerald-500/20 text-emerald-200';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
        on ? active : 'border-slate-700 bg-slate-800/60 text-slate-300 hover:border-slate-600'
      }`}
    >
      {children}
    </button>
  );
}
