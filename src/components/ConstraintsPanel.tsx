import { useMemo, useState } from 'react';
import { Check, ChevronDown, Link2, Lock, Plus, Unlink, X } from 'lucide-react';
import { lineupTeams, membersOf, type DrawConstraint, type Lineup, type Player, type TeamId } from '../types';
import { constraintMet } from '../lib/balance';

const KIND = {
  together: { short: 'יחד', icon: Link2 },
  apart: { short: 'בנפרד', icon: Unlink },
} as const;

const newConstraintId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * אילוצים חד-פעמיים להגרלה של המחזור הזה — "השבוע א' חייב להיות עם ב'".
 * נשמרים בטיוטת המחזור ומתנקים איתה.
 */
export function ConstraintsPanel({
  pool,
  players,
  constraints,
  lineup,
  onChange,
  notify,
}: {
  /** מי שמשחק במחזור, כולל משלימים */
  pool: Player[];
  /** כל המאגר — לשמות של מי שכבר לא במחזור */
  players: Player[];
  constraints: DrawConstraint[];
  lineup: Lineup | null;
  onChange: (next: DrawConstraint[]) => void;
  notify: (msg: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [aId, setAId] = useState('');
  const [bId, setBId] = useState('');
  const [kind, setKind] = useState<DrawConstraint['kind']>('together');

  const sortedPool = useMemo(
    () => [...pool].sort((x, y) => x.name.localeCompare(y.name, 'he')),
    [pool],
  );
  const inPool = useMemo(() => new Set(pool.map((p) => p.id)), [pool]);
  const nameOf = useMemo(
    () => new Map([...players, ...pool].map((p) => [p.id, p.name])),
    [players, pool],
  );
  const teamOf = useMemo(() => {
    const map = new Map<string, TeamId>();
    if (lineup) for (const t of lineupTeams(lineup)) for (const id of membersOf(lineup, t)) map.set(id, t);
    return map;
  }, [lineup]);

  const active = constraints.filter((c) => inPool.has(c.aId) && inPool.has(c.bId));
  const broken = lineup ? active.filter((c) => !constraintMet(c, teamOf)).length : 0;
  const outside = constraints.length - active.length;

  // בחירה שנשארה בתיבה אחרי שהשחקן ירד מהמחזור לא נחשבת
  const canAdd = inPool.has(aId) && inPool.has(bId) && aId !== bId;

  const add = () => {
    if (!canAdd) return;
    const samePair = (c: DrawConstraint) =>
      (c.aId === aId && c.bId === bId) || (c.aId === bId && c.bId === aId);
    // אותו זוג פעמיים לא הגיוני — האילוץ החדש מחליף את הקודם
    const added: DrawConstraint = { id: newConstraintId(), aId, bId, kind };
    onChange([...constraints.filter((c) => !samePair(c)), added]);
    setAId('');
    setBId('');
    if (lineup && !constraintMet(added, teamOf)) notify('האילוץ ייכנס לתוקף בהגרלה הבאה');
  };

  return (
    <section className="card overflow-hidden">
      <button
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-right transition hover:bg-slate-800/40"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-100">
            <Lock size={15} className="text-violet-400" />
            אילוצים להגרלה הזו
          </h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-slate-400">
            <span>{active.length ? `${active.length} אילוצים` : 'אין אילוצים'}</span>
            {broken > 0 && <span className="text-amber-300">· {broken} לא מתקיימים</span>}
            {outside > 0 && <span className="text-slate-500">· {outside} על מי שלא משחק</span>}
          </p>
        </div>
        <ChevronDown
          size={18}
          className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="space-y-3 border-t border-slate-800/70 p-4">
          <div className="grid grid-cols-2 gap-2">
            <select
              className="input !py-2"
              aria-label="שחקן ראשון"
              value={aId}
              onChange={(e) => setAId(e.target.value)}
            >
              <option value="">שחקן…</option>
              {sortedPool.map((p) => (
                <option key={p.id} value={p.id} disabled={p.id === bId}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              className="input !py-2"
              aria-label="שחקן שני"
              value={bId}
              onChange={(e) => setBId(e.target.value)}
            >
              <option value="">עם…</option>
              {sortedPool.map((p) => (
                <option key={p.id} value={p.id} disabled={p.id === aId}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2">
            {(Object.keys(KIND) as DrawConstraint['kind'][]).map((k) => {
              const Icon = KIND[k].icon;
              return (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  className={`inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold whitespace-nowrap transition ${
                    kind === k
                      ? 'border-violet-500/50 bg-violet-500/15 text-violet-200'
                      : 'border-slate-700 bg-slate-800/40 text-slate-400 hover:text-white'
                  }`}
                >
                  <Icon size={13} />
                  {KIND[k].short}
                </button>
              );
            })}
            <button
              className="btn-primary !px-3 !py-2 text-xs"
              onClick={add}
              disabled={!canAdd}
            >
              <Plus size={14} />
              הוספה
            </button>
          </div>

          {constraints.length > 0 && (
            <ul className="space-y-1.5">
              {constraints.map((c) => {
                const Icon = KIND[c.kind].icon;
                const playing = inPool.has(c.aId) && inPool.has(c.bId);
                const met = playing && lineup ? constraintMet(c, teamOf) : null;

                return (
                  <li
                    key={c.id}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${
                      !playing
                        ? 'border-slate-800 bg-slate-950/40 text-slate-500'
                        : met === false
                          ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                          : 'border-violet-500/30 bg-violet-500/5 text-slate-200'
                    }`}
                  >
                    <Icon size={13} className="shrink-0 text-violet-300" />
                    <span className="min-w-0 flex-1 truncate">
                      {nameOf.get(c.aId) ?? '?'} · {nameOf.get(c.bId) ?? '?'}
                      <span className="ms-1.5 opacity-70">{KIND[c.kind].short}</span>
                    </span>
                    {!playing && <span className="shrink-0 text-[10px]">לא משחק</span>}
                    {met === true && <Check size={14} className="shrink-0 text-emerald-400" />}
                    {met === false && <span className="shrink-0 text-amber-400">✕</span>}
                    <button
                      className="shrink-0 rounded-lg p-1 text-slate-400 transition hover:bg-rose-500/15 hover:text-rose-300"
                      title="הסרת האילוץ"
                      aria-label="הסרת האילוץ"
                      onClick={() => onChange(constraints.filter((x) => x.id !== c.id))}
                    >
                      <X size={13} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
