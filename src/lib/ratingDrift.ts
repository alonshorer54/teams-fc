import {
  isFillerId,
  recordPlacements,
  teamsIn,
  type MatchRecord,
  type Player,
  type RatingChangeRecord,
} from '../types';

/**
 * תיקון דירוג אוטומטי מהתוצאות — "המד".
 *
 * הדירוג נקבע ידנית ולא זז לעולם, אז שחקן שדורג לא נכון גורר קבוצות לא מאוזנות
 * שבוע אחרי שבוע. התוצאות שכבר נרשמות בכל מחזור הן בדיוק המידע שחסר.
 *
 * לכל שחקן מד שלם: ניצחון +1, הפסד -1, וערב שקול לא מזיז אותו. כל מחזור שלישי
 * בודקים; מד שהגיע ל-±3 מזיז את הדירוג ב-0.1 ו**יורד ב-3, לא מתאפס**.
 *
 * שני הפרטים האלה הם כל העניין:
 *
 * - **שקול = 0** ולא ערך חיובי. אילו ערב שקול היה מזכה, אז במצב המושלם שבו כל
 *   הקבוצות שקולות כל שבוע כל השחקנים היו עולים בלי סוף — ההפך הגמור ממה שצריך
 *   לקרות. שקול הוא התוצאה הצפויה, ולכן הוא לא מזכה ולא מעניש.
 * - **המד לא מתאפס בבדיקה.** אילו התאפס, רצף של ניצחון-שקול-ניצחון היה נמחק בכל
 *   בדיקה והשחקן לא היה מתוקן לעולם. ההתקדמות נשמרת, ורק תוצאה הפוכה מקזזת אותה.
 *
 * מכיוון שהשארית אחרי בדיקה היא לכל היותר 2 והחלון מוסיף לכל היותר 3, אף שחקן לא
 * יכול לזוז יותר מ-0.1 בבדיקה אחת.
 */

/** מד שהגיע לערך הזה (בכל אחד מהכיוונים) מזיז את הדירוג */
export const GAUGE_THRESHOLD = 3;

/** גודל הקפיצה — יחידת הדירוג הקטנה ביותר באפליקציה */
export const RATING_STEP = 0.1;

/** כל כמה מחזורים עם תוצאה רצה בדיקה */
export const ROUNDS_PER_CHECK = 3;

const MIN_RATING = 1;
const MAX_RATING = 5;

/** עיגול לעשירית — בלי זה 3 + 0.1 היה נשמר כ-3.0000000000000004 */
const roundRating = (n: number) => Math.round(n * 10) / 10;

export const clampRating = (n: number): number =>
  Math.min(MAX_RATING, Math.max(MIN_RATING, roundRating(n)));

export type RatingChange = RatingChangeRecord;

/**
 * מתי הרשומה נכנסה למערכת — לשאלה "האם היא מלפני שהתכונה הופעלה".
 * `date` הוא גיבוי לרשומות ישנות שנשמרו בלי חותמת.
 */
const savedTime = (record: MatchRecord) => record.savedAt || `${record.date}T00:00:00.000Z`;

/**
 * סדר המחזורים — לפי תאריך המשחק, לא לפי זמן השמירה.
 *
 * "כל מחזור שלישי" מדבר על ערבי משחק לפי סדרם, וזה לא בהכרח הסדר שבו הם נשמרו:
 * אפשר לשמור שתי הגרלות באותה ישיבה, או להזין ערב באיחור. זמן השמירה משמש רק
 * כשובר שוויון בין שני ערבים באותו תאריך.
 */
const matchOrder = (record: MatchRecord) => `${record.date}|${record.savedAt ?? ''}`;

/**
 * ההגרלות שנספרות במד: יש להן תוצאה, והן נשמרו אחרי שהתכונה הופעלה.
 * מוחזרות מהישן לחדש — ההיסטוריה עצמה שמורה מהחדש לישן.
 */
export function countedRounds(history: MatchRecord[], since?: string): MatchRecord[] {
  return history
    .filter((r) => !!recordPlacements(r) && (!since || savedTime(r) > since))
    .sort((a, b) => matchOrder(a).localeCompare(matchOrder(b)));
}

/**
 * הניקוד של כל שחקן בערב אחד.
 *
 * ההשוואה היא לממוצע המקומות של אותו ערב ולא לתווית קבועה, וזה מה שגורם לשני
 * מקרי הקצה לצאת נכון בלי טיפול מיוחד: ערב שבו כל הקבוצות סומנו באותו מקום נותן
 * 0 לכולם, ובשתי קבוצות שסומנו יחד כמנצחות אף אחת מהן לא מקבלת נקודה על חשבון
 * השנייה.
 */
export function eveningScore(record: MatchRecord): Map<string, number> {
  const out = new Map<string, number>();
  const placements = recordPlacements(record);
  if (!placements) return out;

  const teams = teamsIn(record.teams);
  if (!teams.length) return out;

  const places = teams.map((t) => placements[t] ?? teams.length);
  const avg = places.reduce((a, b) => a + b, 0) / places.length;

  teams.forEach((team, i) => {
    // מקום נמוך יותר = טוב יותר, ולכן מתחת לממוצע זה ניצחון
    const score = places[i] < avg ? 1 : places[i] > avg ? -1 : 0;
    // משלימים הם שחקני ערב אחד ואין להם דירוג במאגר שאפשר לתקן
    for (const p of record.teams[team] ?? []) if (!isFillerId(p.id)) out.set(p.id, score);
  });
  return out;
}

/**
 * המד הנוכחי של כל שחקן.
 *
 * נגזר מההיסטוריה ולא נשמר בנפרד: סכום ניקוד הערבים, פחות 3 על כל תיקון שכבר
 * נרשם. מקור אמת יחיד — מונה שמור היה יכול להתפצל מההיסטוריה אחרי עריכה.
 */
export function computeGauges(history: MatchRecord[], since?: string): Map<string, number> {
  const gauges = new Map<string, number>();
  const add = (id: string, n: number) => gauges.set(id, (gauges.get(id) ?? 0) + n);

  for (const record of countedRounds(history, since)) {
    for (const [id, score] of eveningScore(record)) add(id, score);
    // תיקון שכבר בוצע "שילם" 3 יחידות מד, בכיוון שבו הוא נורה
    for (const c of record.ratingCheck?.changes ?? []) {
      add(c.playerId, -Math.sign(c.gauge) * GAUGE_THRESHOLD);
    }
  }
  return gauges;
}

/** האם ההגרלה הזו היא כל שלישית, כלומר נקודת בדיקה */
export function isCheckpoint(
  history: MatchRecord[],
  recordId: string,
  since?: string,
): boolean {
  const index = countedRounds(history, since).findIndex((r) => r.id === recordId);
  return index >= 0 && (index + 1) % ROUNDS_PER_CHECK === 0;
}

/** כמה מחזורים עם תוצאה נותרו עד הבדיקה הבאה. 1 = המחזור הבא הוא בדיקה. */
export function roundsUntilCheck(history: MatchRecord[], since?: string): number {
  const done = countedRounds(history, since).length;
  return ROUNDS_PER_CHECK - (done % ROUNDS_PER_CHECK);
}

/**
 * מה יזוז בבדיקה. מחזיר גם שינוי שבו `from === to` — שחקן שכבר בקצה טווח הדירוג
 * צורך את המד בכל זאת, אחרת הוא היה מנדנד באותה בדיקה שוב ושוב.
 */
export function runCheck(
  players: Player[],
  history: MatchRecord[],
  since?: string,
): RatingChange[] {
  const gauges = computeGauges(history, since);

  // ניקוד הערבים האחרונים של כל שחקן, כדי שהחלון יוכל להראות למה זה קרה
  const recent = new Map<string, number[]>();
  for (const record of countedRounds(history, since)) {
    for (const [id, score] of eveningScore(record)) {
      const list = recent.get(id) ?? [];
      list.push(score);
      if (list.length > ROUNDS_PER_CHECK) list.shift();
      recent.set(id, list);
    }
  }

  const changes: RatingChange[] = [];
  for (const p of players) {
    const gauge = gauges.get(p.id) ?? 0;
    if (Math.abs(gauge) < GAUGE_THRESHOLD) continue;
    changes.push({
      playerId: p.id,
      name: p.name,
      from: p.rating,
      to: clampRating(p.rating + Math.sign(gauge) * RATING_STEP),
      gauge,
      recent: recent.get(p.id) ?? [],
    });
  }

  return changes.sort(
    (a, b) => Math.abs(b.gauge) - Math.abs(a.gauge) || a.name.localeCompare(b.name, 'he'),
  );
}

/** מחיל תיקונים על המאגר */
export const applyChanges = (players: Player[], changes: RatingChange[]): Player[] => {
  const byId = new Map(changes.map((c) => [c.playerId, c]));
  return players.map((p) => {
    const c = byId.get(p.id);
    return c ? { ...p, rating: c.to } : p;
  });
};

/**
 * מבטל תיקונים. מחסיר את ההפרש במקום לכתוב את הערך הישן, כדי שעריכה ידנית
 * שנעשתה מאז לא תימחק.
 */
export const revertChanges = (players: Player[], changes: RatingChange[]): Player[] => {
  const byId = new Map(changes.map((c) => [c.playerId, c]));
  return players.map((p) => {
    const c = byId.get(p.id);
    return c ? { ...p, rating: clampRating(p.rating - (c.to - c.from)) } : p;
  });
};
