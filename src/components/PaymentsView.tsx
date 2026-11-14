import { useState } from 'react';
import {
  Check,
  ChevronDown,
  Copy,
  History,
  PartyPopper,
  RotateCcw,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import type { Player } from '../types';
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_ORDER,
  type PaymentMethod,
  type PaymentRound,
} from '../lib/storage';
import { closeEvening, togglePaid, updateEvening } from '../lib/payments';
import { copyToClipboard, formatHebrewDate } from '../lib/format';
import { ConfirmDialog, EmptyState, Modal } from './ui';

/**
 * גבייה שבועית. אין דרך לקרוא תשלומים מביט אוטומטית — אין להם API ציבורי —
 * ולכן הסימון ידני, עם קיצורי דרך שמקצרים את העבודה למינימום.
 *
 * הגבייה של הערב האחרון למעלה; ערבים קודמים שעוד חייבים בהם מכווצים מתחתיה.
 */
/** Someone on a payment list: a player in the squad, or one deleted since who still owes */
type Payer = Pick<Player, 'id' | 'name' | 'isManager'> & { deleted?: boolean };

export function PaymentsView({
  players: squad,
  formerNames,
  payments,
  onChange,
  notify,
}: {
  players: Player[];
  /** Names of deleted players, from the evenings they played */
  formerNames: Map<string, string>;
  payments: PaymentRound;
  onChange: (updater: (prev: PaymentRound) => PaymentRound) => void;
  notify: (msg: string) => void;
}) {
  const [openEarlier, setOpenEarlier] = useState<string | null>(null);
  const { earlier = [], ...current } = payments;
  // Deleting a player mustn't quietly wipe what they owe: they stay on the list, marked
  const known = new Set(squad.map((p) => p.id));
  const listed = new Set([current, ...earlier].flatMap((r) => r.playerIds ?? []));
  const players: Payer[] = [
    ...squad,
    ...[...listed]
      .filter((id) => !known.has(id))
      .map((id) => ({ id, name: formerNames.get(id) ?? 'שחקן שנמחק', deleted: true })),
  ];
  const hasCurrent = rosterOf(players, current).length > 0;

  if (!hasCurrent && earlier.length === 0) {
    return (
      <EmptyState
        icon={<Wallet size={28} />}
        title="אין גבייה פתוחה"
        hint='גבייה נפתחת כשמדביקים רשימה מהוואטסאפ או שומרים קבוצות בלשונית "קבוצות".'
      />
    );
  }

  const roundProps = (date: string) => ({
    players,
    notify,
    onChange: (change: (r: PaymentRound) => PaymentRound) =>
      onChange((prev) => updateEvening(prev, date, change)),
    onClose: () => onChange((prev) => closeEvening(prev, date)),
  });

  return (
    <div className="space-y-4">
      {hasCurrent && <RoundCard round={current} {...roundProps(current.matchDate)} />}

      {earlier.length > 0 && (
        <section className="space-y-2">
          <h2 className="flex items-center gap-1.5 px-1 text-xs font-bold text-slate-400">
            <History size={13} />
            גביות קודמות שעוד פתוחות
          </h2>
          {earlier.map((round) => {
            const roster = rosterOf(players, round);
            const paidCount = roster.filter((p) => round.paid[p.id]).length;
            const open = openEarlier === round.matchDate;
            return (
              <div key={round.matchDate} className="space-y-2">
                <button
                  onClick={() => setOpenEarlier(open ? null : round.matchDate)}
                  aria-expanded={open}
                  className="card flex w-full items-center gap-3 px-4 py-3 text-start transition hover:border-slate-600"
                >
                  <Wallet size={15} className="shrink-0 text-slate-500" />
                  <span className="flex-1 text-sm font-semibold text-slate-200">
                    {formatHebrewDate(round.matchDate)}
                  </span>
                  <span className="font-mono text-xs tabular-nums text-emerald-300">
                    {paidCount}/{roster.length}
                  </span>
                  <span className="rounded-lg bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold text-rose-300">
                    {roster.length - paidCount} חייבים
                  </span>
                  <ChevronDown
                    size={16}
                    className={`shrink-0 text-slate-500 transition ${open ? 'rotate-180' : ''}`}
                  />
                </button>
                {open && <RoundCard round={round} {...roundProps(round.matchDate)} />}
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}

/** מי ברשימת הגבייה, המנהל ראשון ואז לפי שם */
function rosterOf(players: Payer[], round: PaymentRound): Payer[] {
  const ids = new Set(round.playerIds ?? []);
  return players
    .filter((p) => ids.has(p.id))
    .sort(
      (a, b) =>
        Number(!!b.isManager) - Number(!!a.isManager) || a.name.localeCompare(b.name, 'he'),
    );
}

/** גבייה של ערב אחד */
function RoundCard({
  round,
  players,
  onChange,
  onClose,
  notify,
}: {
  round: PaymentRound;
  players: Payer[];
  onChange: (change: (r: PaymentRound) => PaymentRound) => void;
  onClose: () => void;
  notify: (msg: string) => void;
}) {
  const [confirmReset, setConfirmReset] = useState(false);
  /** החלון שקופץ ברגע שהאחרון שילם */
  const [celebrate, setCelebrate] = useState(false);

  const payDate = round.matchDate;
  const roster = rosterOf(players, round);

  const paidCount = roster.filter((p) => round.paid[p.id]).length;
  const owing = roster.filter((p) => !round.paid[p.id]);
  const total = round.amount * roster.length;
  const collected = round.amount * paidCount;
  const allPaid = roster.length > 0 && owing.length === 0;

  const toggle = (id: string, method: PaymentMethod = 'bitGroup') => {
    // השינוי מחושב מול המצב העדכני, לא מול מה שהיה על המסך בזמן הלחיצה
    onChange((r) => togglePaid(r, id, method));
    if (!round.paid[id] && owing.length === 1 && owing[0].id === id) setCelebrate(true);
  };

  const reminderText = () => {
    const lines = [
      `💰 תשלום לכדורגל ${formatHebrewDate(payDate)}`,
      round.amount ? `${round.amount} ₪ לשחקן` : null,
      '',
      'עדיין לא שילמו:',
      ...owing.map((p) => `• ${p.name}`),
    ].filter((l) => l !== null);
    return lines.join('\n');
  };

  const amountId = `pay-amount-${payDate}`;

  return (
    <div className="space-y-4">
      {allPaid && (
        <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-200">
          <PartyPopper size={15} className="shrink-0" />
          <span>
            <b>כולם שילמו.</b> אשרו כדי לסגור את הגבייה.
          </span>
          <button className="btn-primary ms-auto !py-1.5 text-xs" onClick={() => setCelebrate(true)}>
            <Check size={13} />
            מאשר
          </button>
        </div>
      )}

      {/* סיכום */}
      <section className="card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-100">
            <Wallet size={16} className="text-emerald-400" />
            גבייה ל־{formatHebrewDate(payDate)}
          </h2>
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-semibold text-slate-400" htmlFor={amountId}>
              סכום לשחקן
            </label>
            <input
              id={amountId}
              type="number"
              min={0}
              step={5}
              value={round.amount || ''}
              placeholder="₪"
              onChange={(e) => {
                const amount = Math.max(0, Number(e.target.value) || 0);
                onChange((r) => ({ ...r, amount }));
              }}
              className="input w-24 py-1.5 text-center font-mono"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Stat label="שילמו" value={`${paidCount}/${roster.length}`} tone="emerald" />
          <Stat label="נאספו" value={round.amount ? `${collected} ₪` : '—'} tone="sky" />
          <Stat
            label="חסר"
            value={round.amount ? `${total - collected} ₪` : `${owing.length} שחקנים`}
            tone={owing.length ? 'rose' : 'emerald'}
          />
        </div>

        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${roster.length ? (paidCount / roster.length) * 100 : 0}%` }}
          />
        </div>
      </section>

      {/* רשימת השחקנים */}
      <section className="card overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/70 px-4 py-3">
          <p className="text-xs font-bold text-slate-300">מי שילם</p>
          <div className="flex gap-2">
            <button
              className="btn-ghost !py-1.5 text-xs"
              onClick={async () => {
                const ok = await copyToClipboard(reminderText());
                notify(ok ? 'תזכורת הועתקה — הדביקו בקבוצה' : 'ההעתקה נכשלה');
              }}
              disabled={owing.length === 0}
            >
              <Copy size={13} />
              תזכורת לחייבים
            </button>
            <button className="btn-ghost !py-1.5 text-xs" onClick={() => setConfirmReset(true)}>
              <RotateCcw size={13} />
              איפוס
            </button>
          </div>
        </header>

        <p className="border-b border-slate-800/70 px-4 py-2 text-[10px] leading-relaxed text-slate-500">
          הרשימה נפתחת מהרשימה שהודבקה מהוואטסאפ, ומתעדכנת למי ששיחק בפועל כששומרים את הקבוצות.
        </p>

        <ul className="divide-y divide-slate-800/60">
          {roster.map((p) => {
            const record = round.paid[p.id];
            return (
              // השם בשורה משלו: בטלפון ארבעת הכפתורים לידו כיווצו אותו לאות אחת, ואז קל
              // לסמן את האדם הלא נכון. הגובה זהה לפני הסימון ואחריו, כדי שהשורות שמתחת
              // לא יזוזו בין שתי לחיצות
              <li key={p.id} className="px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggle(p.id)}
                    className={`flex size-7 shrink-0 items-center justify-center rounded-lg border transition ${
                      record
                        ? 'border-emerald-500/60 bg-emerald-500/20 text-emerald-300'
                        : 'border-slate-700 text-slate-600 hover:border-emerald-500/40'
                    }`}
                    aria-label={record ? `סימון ש${p.name} לא שילם` : `סימון ש${p.name} שילם`}
                  >
                    {record && <Check size={14} />}
                  </button>

                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    <span
                      className={`truncate text-sm font-semibold ${
                        record ? 'text-slate-400 line-through' : 'text-slate-100'
                      }`}
                    >
                      {p.name}
                    </span>
                    {p.deleted && (
                      <span className="shrink-0 rounded bg-slate-700/60 px-1.5 text-[10px] text-slate-400">
                        נמחק מהמאגר
                      </span>
                    )}
                    {p.isManager && (
                      <ShieldCheck size={12} className="shrink-0 text-amber-400" aria-label="מנהל" />
                    )}
                  </span>
                </div>

                <div className="ms-9 mt-1.5 flex flex-wrap gap-1">
                  {record ? (
                    <span className="rounded-lg border border-transparent bg-emerald-500/15 px-2 py-1.5 text-[10px] font-semibold text-emerald-300">
                      {PAYMENT_METHODS[record.method]}
                    </span>
                  ) : (
                    PAYMENT_METHOD_ORDER.map((m) => (
                      <button
                        key={m}
                        onClick={() => toggle(p.id, m)}
                        className="rounded-lg border border-slate-700 bg-slate-800/50 px-2 py-1.5 text-[10px] font-semibold text-slate-400 transition hover:border-emerald-500/40 hover:text-emerald-200"
                      >
                        {PAYMENT_METHODS[m]}
                      </button>
                    ))
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <ConfirmDialog
        open={confirmReset}
        title="איפוס הגבייה"
        message="לאפס את כל סימוני התשלום של הערב הזה? הרשימה והסכום יישמרו."
        confirmLabel="איפוס"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          // רק הסימונים: הרשימה נגזרת מההגרלה, ובלעדיה הייתה חוזרת מיד
          onChange((r) => ({ ...r, paid: {} }));
          setConfirmReset(false);
          notify('הגבייה אופסה');
        }}
      />

      <Modal
        open={celebrate}
        onClose={() => setCelebrate(false)}
        title="כולם שילמו!"
        icon={<PartyPopper size={20} className="text-emerald-400" />}
        maxWidth="max-w-sm"
      >
        <p className="text-sm leading-relaxed text-slate-300">
          כל {roster.length} השחקנים של {formatHebrewDate(payDate)} שילמו
          {round.amount ? ` — ${collected} ₪ נאספו` : ''}. לאשר ולסגור את הגבייה?
        </p>
        <div className="mt-6 flex gap-2">
          <button
            className="btn-primary flex-1"
            onClick={() => {
              onClose();
              setCelebrate(false);
              notify('הגבייה נסגרה ✔');
            }}
          >
            מאשר
          </button>
          <button className="btn-ghost flex-1" onClick={() => setCelebrate(false)}>
            עוד לא
          </button>
        </div>
      </Modal>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'emerald' | 'sky' | 'rose';
}) {
  const tones = {
    emerald: 'text-emerald-300',
    sky: 'text-sky-300',
    rose: 'text-rose-300',
  };
  return (
    <div className="rounded-xl bg-slate-900/50 px-3 py-2.5 text-center">
      <p className={`font-mono text-lg font-bold tabular-nums ${tones[tone]}`}>{value}</p>
      <p className="mt-0.5 text-[10px] text-slate-500">{label}</p>
    </div>
  );
}
