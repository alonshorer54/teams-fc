import { useMemo, useState } from 'react';
import { Check, CircleAlert, Copy, RotateCcw, ShieldCheck, Wallet } from 'lucide-react';
import type { Player } from '../types';
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_ORDER,
  type AppSettings,
  type PaymentMethod,
  type PaymentRound,
} from '../lib/storage';
import { copyToClipboard, formatHebrewDate } from '../lib/format';
import { ConfirmDialog, EmptyState } from './ui';

/**
 * גבייה שבועית. אין דרך לקרוא תשלומים מביט אוטומטית — אין להם API ציבורי —
 * ולכן הסימון ידני, עם קיצורי דרך שמקצרים את העבודה למינימום.
 */
export function PaymentsView({
  players,
  roundPlayerIds,
  matchDate,
  settings,
  onChange,
  notify,
}: {
  players: Player[];
  /** מי משחק במחזור הנוכחי */
  roundPlayerIds: string[];
  matchDate: string;
  settings: AppSettings;
  onChange: (updater: (prev: AppSettings) => AppSettings) => void;
  notify: (msg: string) => void;
}) {
  const [confirmReset, setConfirmReset] = useState(false);
  const payments = settings.payments;

  // המחזור התחלף — הגבייה הישנה כבר לא רלוונטית
  const staleRound = payments.matchDate !== matchDate && payments.matchDate !== '';

  const roster = useMemo(() => {
    const ids = new Set(roundPlayerIds);
    return players
      .filter((p) => ids.has(p.id))
      .sort(
        (a, b) =>
          Number(!!b.isManager) - Number(!!a.isManager) || a.name.localeCompare(b.name, 'he'),
      );
  }, [players, roundPlayerIds]);

  const paidCount = roster.filter((p) => payments.paid[p.id]).length;
  const owing = roster.filter((p) => !payments.paid[p.id]);
  const total = payments.amount * roster.length;
  const collected = payments.amount * paidCount;

  const update = (next: Partial<PaymentRound>) =>
    onChange((prev) => ({ ...prev, payments: { ...prev.payments, matchDate, ...next } }));

  const togglePaid = (id: string, method: PaymentMethod = 'bitGroup') => {
    const paid = { ...payments.paid };
    if (paid[id]) delete paid[id];
    else paid[id] = { at: new Date().toISOString(), method };
    update({ paid });
  };

  const reminderText = () => {
    const lines = [
      `💰 תשלום לכדורגל ${formatHebrewDate(matchDate)}`,
      payments.amount ? `${payments.amount} ₪ לשחקן` : null,
      '',
      'עדיין לא שילמו:',
      ...owing.map((p) => `• ${p.name}`),
    ].filter((l) => l !== null);
    return lines.join('\n');
  };

  if (roster.length === 0) {
    return (
      <EmptyState
        icon={<Wallet size={28} />}
        title="אין מחזור פעיל"
        hint='בנו מחזור בלשונית "קבוצות" — מי שמשחק יופיע כאן לגבייה.'
      />
    );
  }

  return (
    <div className="space-y-4">
      {staleRound && (
        <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
          <CircleAlert size={15} className="shrink-0" />
          <span>
            <b>הגבייה הזו היא מ־{formatHebrewDate(payments.matchDate)}</b>, והמחזור הנוכחי הוא מ־
            {formatHebrewDate(matchDate)}. הסימונים לא מתאפסים לבד — כדי לא למחוק לכם נתונים בטעות.
          </span>
          <button
            className="btn-ghost mr-auto !py-1.5 text-xs"
            onClick={() => {
              update({ paid: {}, matchDate });
              notify('הגבייה אופסה למחזור החדש');
            }}
          >
            <RotateCcw size={13} />
            פתיחת גבייה חדשה
          </button>
        </div>
      )}

      {/* סיכום */}
      <section className="card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-100">
            <Wallet size={16} className="text-emerald-400" />
            גבייה ל־{formatHebrewDate(matchDate)}
          </h2>
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-semibold text-slate-400" htmlFor="pay-amount">
              סכום לשחקן
            </label>
            <input
              id="pay-amount"
              type="number"
              min={0}
              step={5}
              value={payments.amount || ''}
              placeholder="₪"
              onChange={(e) => update({ amount: Math.max(0, Number(e.target.value) || 0) })}
              className="input w-24 py-1.5 text-center font-mono"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Stat label="שילמו" value={`${paidCount}/${roster.length}`} tone="emerald" />
          <Stat label="נאספו" value={payments.amount ? `${collected} ₪` : '—'} tone="sky" />
          <Stat
            label="חסר"
            value={payments.amount ? `${total - collected} ₪` : `${owing.length} שחקנים`}
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
          הרשימה מתעדכנת לפי מי שמשחק במחזור הנוכחי. הסימונים נשארים עד שתלחצו "איפוס" — גם אם
          עברתם למחזור חדש.
        </p>

        <ul className="divide-y divide-slate-800/60">
          {roster.map((p) => {
            const record = payments.paid[p.id];
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                <button
                  onClick={() => togglePaid(p.id)}
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
                  {p.isManager && (
                    <ShieldCheck size={12} className="shrink-0 text-amber-400" aria-label="מנהל" />
                  )}
                </span>

                {record ? (
                  <span className="shrink-0 rounded-lg bg-emerald-500/15 px-2 py-1 text-[10px] font-semibold text-emerald-300">
                    {PAYMENT_METHODS[record.method]}
                  </span>
                ) : (
                  <span className="flex shrink-0 flex-wrap justify-end gap-1">
                    {PAYMENT_METHOD_ORDER.map((m) => (
                      <button
                        key={m}
                        onClick={() => togglePaid(p.id, m)}
                        className="rounded-lg border border-slate-700 bg-slate-800/50 px-2 py-1.5 text-[10px] font-semibold text-slate-400 transition hover:border-emerald-500/40 hover:text-emerald-200"
                      >
                        {PAYMENT_METHODS[m]}
                      </button>
                    ))}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <ConfirmDialog
        open={confirmReset}
        title="איפוס הגבייה"
        message="לאפס את כל סימוני התשלום למחזור הזה? הסכום והקישור יישמרו."
        confirmLabel="איפוס"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          update({ paid: {} });
          setConfirmReset(false);
          notify('הגבייה אופסה');
        }}
      />
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
