import { allInLineup, isFillerId, recordLineup, type MatchRecord } from '../types';
import type { PaymentMethod, PaymentRound } from './storage';

/** מי ברשימת הגבייה ועוד לא שילם */
export const owingIds = (round: PaymentRound): string[] =>
  (round.playerIds ?? []).filter((id) => !round.paid[id]);

/** גבייה שעוד חייבים בה — רק כזו נשמרת כשנפתח ערב חדש */
export const isUnfinished = (round: PaymentRound): boolean => owingIds(round).length > 0;

/** אותו ערב, רשימה מעודכנת: מי שנשאר שומר את הסימון שלו, מי שהוחלף יוצא */
function withRoster(round: PaymentRound, playerIds: string[]): PaymentRound {
  const keep = new Set(playerIds);
  return {
    ...round,
    playerIds,
    paid: Object.fromEntries(Object.entries(round.paid).filter(([id]) => keep.has(id))),
  };
}

const sameIds = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id) => b.includes(id));

/**
 * מה עושים עם ערב ישן יותר מהגבייה הנוכחית:
 * - `ignore` — לא נוגעים (האפקט שמיישר לפי ההיסטוריה: ערב ישן שם כבר טופל או נסגר).
 * - `earlier` — נכנס בין הקודמות, או מתעדכן שם (קבוצות שנשמרו באיחור, אחרי שכבר
 *   הודבקה הרשימה של השבוע הבא).
 * - `replace` — גבייה נוכחית שאף אחד עוד לא שילם בה מוחלפת (רשימה שהודבקה קודם
 *   עם תאריך שגוי); אחרת כמו `earlier`.
 */
export type OlderEvening = 'ignore' | 'earlier' | 'replace';

/**
 * פותח גבייה לערב `date` עם `playerIds`.
 *
 * - אותו ערב: הרשימה מתעדכנת, וכל מי שנשאר בה שומר את הסימון.
 * - ערב חדש: הגבייה הנוכחית, אם עוד חייבים בה, יורדת מתחת לחדשה (`earlier`)
 *   ולא נמחקת. גבייה שכולם שילמו בה פשוט מתחלפת.
 * - ערב ישן יותר מהגבייה הנוכחית: לפי `older`.
 *
 * מחזיר את אותו אובייקט כשאין מה לשנות, כדי שאפקט שקורא לזה לא ירוץ בלולאה.
 */
export function openEvening(
  payments: PaymentRound,
  date: string,
  playerIds: string[],
  older: OlderEvening = 'ignore',
): PaymentRound {
  if (!date || !playerIds.length) return payments;

  if (payments.matchDate === date) {
    return payments.playerIds && sameIds(payments.playerIds, playerIds)
      ? payments
      : withRoster(payments, playerIds);
  }

  const { earlier = [], ...current } = payments;
  const fresh: PaymentRound = {
    matchDate: date,
    // המחיר לשחקן כמעט תמיד זהה משבוע לשבוע
    amount: payments.amount,
    paid: {},
    playerIds,
  };

  if (payments.matchDate > date) {
    if (older === 'ignore') return payments;
    if (older === 'replace' && Object.keys(current.paid).length === 0) {
      return { ...fresh, earlier: earlier.filter((r) => r.matchDate !== date) };
    }
    const existing = earlier.find((r) => r.matchDate === date);
    if (existing?.playerIds && sameIds(existing.playerIds, playerIds)) return payments;
    const round = existing ? withRoster(existing, playerIds) : fresh;
    return {
      ...payments,
      earlier: [...earlier.filter((r) => r.matchDate !== date), round].sort((a, b) =>
        b.matchDate.localeCompare(a.matchDate),
      ),
    };
  }

  return { ...fresh, earlier: isUnfinished(current) ? [current, ...earlier] : earlier };
}

/**
 * מיישר את הגבייה לקבוצות שנשמרו: מי ששיחק בפועל הוא מי שמשלם. כך שם מהרשימה
 * שהוחלף בקבוצות (ביטל ומישהו אחר נכנס) מתחלף גם בגבייה.
 */
export function alignToRecord(
  payments: PaymentRound,
  record: MatchRecord,
  older: OlderEvening = 'ignore',
): PaymentRound {
  const playerIds = allInLineup(recordLineup(record)).filter((id) => !isFillerId(id));
  // הערב הזה כבר שולם ונסגר — לא גובים ממנו שוב
  if (payments.matchDate === record.date && payments.playerIds?.length === 0) return payments;
  return openEvening(payments, record.date, playerIds, older);
}

/** סוגר גבייה: הנוכחית מתרוקנת (התאריך נשאר), וקודמת יורדת מהרשימה */
export function closeEvening(payments: PaymentRound, date: string): PaymentRound {
  if (payments.matchDate === date) return { ...payments, paid: {}, playerIds: [] };
  return { ...payments, earlier: (payments.earlier ?? []).filter((r) => r.matchDate !== date) };
}

/** מעדכן גבייה אחת לפי התאריך שלה — הנוכחית או אחת מהקודמות */
export function updateEvening(
  payments: PaymentRound,
  date: string,
  change: (round: PaymentRound) => PaymentRound,
): PaymentRound {
  if (payments.matchDate === date) {
    const { earlier, ...current } = payments;
    return { ...change(current), ...(earlier && { earlier }) };
  }
  return {
    ...payments,
    earlier: (payments.earlier ?? []).map((r) => (r.matchDate === date ? change(r) : r)),
  };
}

/** סימון או ביטול תשלום, מול המצב העדכני ולא מול מה שהיה על המסך בזמן הלחיצה */
export function togglePaid(
  round: PaymentRound,
  id: string,
  method: PaymentMethod,
): PaymentRound {
  const paid = { ...round.paid };
  if (paid[id]) delete paid[id];
  else paid[id] = { at: new Date().toISOString(), method };
  return { ...round, paid };
}
