import { lineupTeams, membersOf, type Lineup, type Player, type TeamId } from '../types';

/**
 * הקריטריונים שההגרלה מתחשבת בהם.
 * הסדר ניתן לשינוי, וכל קריטריון אפשר לכבות.
 */
export type CriterionId = 'rating' | 'friends' | 'gameChemistry' | 'affinity' | 'tags';

export interface CriterionSetting {
  id: CriterionId;
  enabled: boolean;
}

/** סדר ברירת המחדל — דירוג ראשון, אחר כך חברויות, כימיה משחקית, ואהבה/שנאה */
export const DEFAULT_PRIORITIES: CriterionSetting[] = [
  { id: 'rating', enabled: true },
  { id: 'friends', enabled: true },
  // דלוק כברירת מחדל: הקנס שלו הוא 0 כל עוד אין אף זוג שעבר את סף המדגם,
  // אז זה פשוט "מתעורר" מעצמו בשבוע שבו נצברו מספיק תוצאות
  { id: 'gameChemistry', enabled: true },
  { id: 'affinity', enabled: true },
  { id: 'tags', enabled: true },
];

/**
 * גרסת ברירות המחדל של סדר העדיפויות.
 * העלאה כאן מריצה מיגרציה חד-פעמית אצל מי שכבר שמר הגדרות בענן.
 */
export const PRIORITIES_VERSION = 2;

export const CRITERION_META: Record<
  CriterionId,
  { label: string; help: string; emoji: string }
> = {
  rating: {
    label: 'דירוג',
    emoji: '⭐',
    help: 'משווה את סך הדירוגים בין הקבוצות. זה מה שקובע שהקבוצות שקולות.',
  },
  friends: {
    label: 'חברויות',
    emoji: '🤝',
    help: 'משאיר חברים באותה קבוצה.',
  },
  gameChemistry: {
    label: 'כימיה משחקית',
    emoji: '✨',
    help: 'זוגות שמנצחים יחד מעבר לצפוי נחשבים חיזוק, וההגרלה מקזזת אותם בין הקבוצות. דורש היסטוריה.',
  },
  affinity: {
    label: 'מעדיף עם / בלי',
    emoji: '👍',
    help: 'מחבר את מי שמעדיף לשחק יחד, ומפריד את מי שמעדיף לא.',
  },
  tags: {
    label: 'תגיות',
    emoji: '🏷️',
    help: 'מפזר שווה בין הקבוצות שחקנים עם אותה תגית — למשל שלא כל מי שלא בכושר ייפול לאותה קבוצה.',
  },
};

/**
 * משקל לפי מיקום בסדר העדיפויות.
 * כל דרגה שווה בערך פי 6 מהבאה אחריה — מספיק כדי שהעליונה תכריע,
 * אבל לא כל כך הרבה שהתחתונות יהפכו לחסרות משמעות לגמרי.
 */
export const priorityWeight = (rank: number) => 1000 / Math.pow(6, rank);

/**
 * כמה כל קריטריון מוכן להתגמש כשמחפשים חלוקה מגוונת, כמכפיל של סובלנות הבסיס.
 *
 * זה לא אותו דבר לכל הקריטריונים, ובכוונה. דירוג הוא האיזון עצמו וחברויות הן
 * הבטחה למשתמש, אז שניהם כמעט לא זזים. אבל הקנסות של תגיות והעדפות אישיות
 * מנורמלים לפי מספר המחזיקים, כך שתגית שיש לה שני שחקנים קופצת ב-0.5 שלמות
 * ברגע ששניהם באותה קבוצה — סובלנות אחידה הייתה פוסלת בגללה כל חלופה.
 * הקריטריונים התחתונים הם בדיוק אלה שאמורים לזוז ראשונים.
 */
export const VARIETY_FLEX: Record<CriterionId, number> = {
  rating: 1,
  friends: 0,
  gameChemistry: 5,
  affinity: 3,
  tags: 8,
};

/**
 * כמה יחסים בדידים כל קריטריון סופר בבריכה הזו.
 *
 * `friends` ו-`affinity` לא מודדים גודל רציף אלא אירועים שאפשר לספור: קשר
 * שנשבר, העדפה שהופרה. הקנס שלהם הוא שבר מתוך המספר הזה, כך שאותו אחוז
 * סובלנות אומר דבר אחר לגמרי בבריכה עם 19 קשרים ובבריכה עם 4 העדפות.
 * מי שרוצה לומר "קשר אחד" צריך את המכנה.
 */
export function relationCounts(pool: Player[]): Partial<Record<CriterionId, number>> {
  const ids = new Set(pool.map((p) => p.id));
  const seen = new Set<string>();
  let friends = 0;
  let affinity = 0;

  for (const p of pool) {
    for (const id of p.friendIds) {
      if (!ids.has(id)) continue;
      const key = pairKey(p.id, id);
      if (seen.has(key)) continue;
      seen.add(key);
      friends++;
    }
    affinity += p.loveIds.filter((id) => ids.has(id)).length;
    affinity += p.hateIds.filter((id) => ids.has(id)).length;
  }
  return { friends, affinity };
}

/** הקנס של כל קריטריון, מנורמל לטווח 0..1 בערך, כדי שהמשקלים יהיו בני-השוואה. */
export interface PenaltyInput {
  lineup: Lineup;
  pool: Player[];
  ratingOf: Map<string, number>;
  /** אפקטים נלמדים לזוגות, לפי מפתח מסודר */
  pairEffects: Map<string, number>;
}

const spreadOf = (values: number[]) =>
  values.length ? Math.max(...values) - Math.min(...values) : 0;

const pairKey = (a: string, b: string) => [a, b].sort().join('|');

function teamMap(lineup: Lineup): Map<string, TeamId> {
  const map = new Map<string, TeamId>();
  for (const t of lineupTeams(lineup)) for (const id of membersOf(lineup, t)) map.set(id, t);
  return map;
}

/** רק הקבוצות שיש בהן שחקנים — קבוצה ריקה תעוות כל השוואה. */
const activeTeams = (lineup: Lineup): TeamId[] =>
  lineupTeams(lineup).filter((t) => membersOf(lineup, t).length > 0);

/* ------------------------------ הקריטריונים ------------------------------ */

function ratingPenalty({ lineup, ratingOf }: PenaltyInput): number {
  const avgs = activeTeams(lineup).map((t) => {
    const members = membersOf(lineup, t);
    return members.reduce((s, id) => s + (ratingOf.get(id) ?? 0), 0) / members.length;
  });
  // פער של נקודת דירוג שלמה בממוצע נחשב קנס מלא
  return Math.min(1, spreadOf(avgs));
}

/* ----------------------- פיזור רמות — תמיד פעיל ----------------------- */

/**
 * פיזור הרמות אינו קריטריון שאפשר להזיז או לכבות: הוא תופס תמיד את המקום
 * השני בשקלול, מיד אחרי הקריטריון העליון, וכל השאר יורדים דרגה. עדיף לכל
 * קבוצה שחקן חזק משלה מאשר שני חברים חזקים באותה קבוצה.
 */
const TIERS_RANK = 1;

/** כמה חלופה מגוונת מותר לה להיות פחות מפוזרת מהטובה ביותר (ראו VARIETY_TOLERANCE) */
export const TIERS_VARIETY_FLEX = 0.5;

export const TIERS_META = { label: 'פיזור רמות', emoji: '📶' };

/**
 * סטייה ממוצעת לשחקן, בנקודות דירוג, שנחשבת קנס מלא בפיזור הרמות.
 * נמוך מזה והקנס נתקע בתקרה כמעט בכל חלוקה — ואז לחיפוש אין לאן להשתפר.
 */
const TIERS_FULL_PENALTY = 0.25;

interface Tiers {
  means: number[];
  /**
   * הסטייה שאי אפשר להימנע ממנה: גם בחלוקה מושלמת 4.8 ו-4.5 באותה שכבה, וכל
   * אחד רחוק מהממוצע שלה. בלי לקזז אותה החלוקה הטובה ביותר הייתה מקבלת 60.
   */
  floor: number;
}

/**
 * השכבות תלויות רק בדירוגים ובמספר הקבוצות, שלא משתנים לאורך הגרלה.
 * הפונקציה נקראת מהלולאה הפנימית של החיפוש, אז הן מחושבות פעם אחת.
 */
const tiersCache = new WeakMap<
  Map<string, number>,
  { width: number; count: number; sum: number; tiers: Tiers }
>();

function tiersOf(profiles: Float64Array[], sum: number, ratingOf: Map<string, number>): Tiers {
  const width = profiles.length;
  let count = 0;
  for (const p of profiles) count += p.length;
  // הסכום נבדק גם הוא: הרכב עם שחקנים אחרים באותה כמות לא יקבל שכבות של אחר
  const cached = tiersCache.get(ratingOf);
  if (cached && cached.width === width && cached.count === count && cached.sum === sum) {
    return cached.tiers;
  }

  const all = profiles.flatMap((p) => [...p]).sort((a, b) => b - a);
  const means: number[] = [];
  let floor = 0;
  for (let i = 0; i < all.length; i += width) {
    const tier = all.slice(i, i + width);
    const mean = tier.reduce((s, r) => s + r, 0) / tier.length;
    means.push(mean);
    for (const r of tier) floor += Math.abs(r - mean);
  }
  const tiers = { means, floor: count ? floor / count : 0 };
  tiersCache.set(ratingOf, { width, count, sum, tiers });
  return tiers;
}

/**
 * השוואת "פרופיל" כל קבוצה לפרופיל האידיאלי.
 *
 * ממיינים את כל השחקנים לפי דירוג וחותכים לשכבות בגודל מספר הקבוצות: שלושת
 * החזקים, שלושת הבאים, וכך הלאה. בחלוקה מושלמת השחקן החזק של כל קבוצה בא
 * מהשכבה הראשונה, השני מהשנייה, והחלש מהאחרונה. הקנס הוא כמה כל שחקן רחוק,
 * בנקודות דירוג, מהממוצע של השכבה שבמקומה הוא עומד.
 *
 * נמדד בנקודות ולא בספירת שכבות בכוונה: שני שחקנים עם אותו דירוג מתחלפים בלי
 * קנס, וגבול בין 4.3 ל-4.2 כמעט לא עולה כלום — כך נשאר מקום לגיוון בין הגרלות.
 */
export function tiersPenalty({ lineup, ratingOf }: PenaltyInput): number {
  const active = activeTeams(lineup);
  if (active.length < 2) return 0;

  // מערך מספרי ממוין בלי פונקציית השוואה — הפונקציה הזו נקראת בלולאה הפנימית
  let total = 0;
  let count = 0;
  const profiles = active.map((t) => {
    const members = membersOf(lineup, t);
    const ratings = new Float64Array(members.length);
    for (let i = 0; i < members.length; i++) {
      ratings[i] = ratingOf.get(members[i]) ?? 0;
      total += ratings[i];
    }
    count += members.length;
    return ratings.sort();
  });
  const { means, floor } = tiersOf(profiles, total, ratingOf);
  const last = means[means.length - 1];

  let sum = 0;
  for (const profile of profiles) {
    // ממוין מהחלש לחזק, אז החזק ביותר בסוף
    for (let slot = 0; slot < profile.length; slot++) {
      const r = profile[profile.length - 1 - slot];
      // עריכה ידנית יכולה לנפח קבוצה מעבר למספר השכבות — היא נמדדת מול האחרונה
      sum += Math.abs(r - (slot < means.length ? means[slot] : last));
    }
  }
  return Math.min(1, Math.max(0, sum / count - floor) / TIERS_FULL_PENALTY);
}

function friendsPenalty({ lineup, pool }: PenaltyInput): number {
  const of = teamMap(lineup);
  let total = 0;
  let broken = 0;
  const seen = new Set<string>();

  for (const p of pool) {
    for (const friendId of p.friendIds) {
      const key = pairKey(p.id, friendId);
      if (seen.has(key) || !of.has(friendId)) continue;
      seen.add(key);
      total++;
      if (of.get(p.id) !== of.get(friendId)) broken++;
    }
  }
  return total ? broken / total : 0;
}

function gameChemistryPenalty({ lineup, pairEffects }: PenaltyInput): number {
  if (!pairEffects.size) return 0;

  const bonuses = activeTeams(lineup).map((t) => {
    const members = membersOf(lineup, t);
    let sum = 0;
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        sum += pairEffects.get(pairKey(members[i], members[j])) ?? 0;
      }
    }
    return sum;
  });
  // פער של 1.0 בסכום האפקטים נחשב קנס מלא
  return Math.min(1, spreadOf(bonuses));
}

function affinityPenalty({ lineup, pool }: PenaltyInput): number {
  const of = teamMap(lineup);
  let total = 0;
  let violated = 0;

  for (const p of pool) {
    const myTeam = of.get(p.id);
    if (!myTeam) continue;

    for (const id of p.loveIds) {
      if (!of.has(id)) continue;
      total++;
      if (of.get(id) !== myTeam) violated++; // רצה איתו ולא קיבל
    }
    for (const id of p.hateIds) {
      if (!of.has(id)) continue;
      total++;
      if (of.get(id) === myTeam) violated++; // לא רצה איתו ובכל זאת יחד
    }
  }
  return total ? violated / total : 0;
}

function tagsPenalty({ lineup, pool }: PenaltyInput): number {
  const byId = new Map(pool.map((p) => [p.id, p]));
  const tags = [...new Set(pool.flatMap((p) => p.tags))];
  if (!tags.length) return 0;

  const active = activeTeams(lineup);
  if (active.length < 2) return 0;

  let sum = 0;
  for (const tag of tags) {
    const counts = active.map(
      (t) => membersOf(lineup, t).filter((id) => byId.get(id)?.tags.includes(tag)).length,
    );
    const holders = counts.reduce((s, c) => s + c, 0);
    if (!holders) continue;
    // פיזור מושלם = הפרש 0 או 1. מנרמלים מול המקרה הגרוע (כולם בקבוצה אחת)
    const worst = Math.max(1, holders);
    sum += Math.max(0, spreadOf(counts) - 1) / worst;
  }
  return Math.min(1, sum / tags.length);
}

const PENALTY_FN: Record<CriterionId, (input: PenaltyInput) => number> = {
  rating: ratingPenalty,
  friends: friendsPenalty,
  gameChemistry: gameChemistryPenalty,
  affinity: affinityPenalty,
  tags: tagsPenalty,
};

/** קנס כולל משוקלל לפי סדר העדיפויות. ככל שנמוך יותר — החלוקה טובה יותר. */
export function weightedPenalty(input: PenaltyInput, priorities: CriterionSetting[]): number {
  let total = tiersPenalty(input) * priorityWeight(TIERS_RANK);
  priorities.forEach((setting, rank) => {
    if (!setting.enabled) return;
    const slot = rank < TIERS_RANK ? rank : rank + 1;
    total += PENALTY_FN[setting.id](input) * priorityWeight(slot);
  });
  return total;
}

/**
 * הקנס של כל קריטריון בנפרד, לפי סדר העדיפויות ובלי שקלול.
 * קריטריון כבוי מקבל 0, כדי שהמערך יישאר מיושר מול רשימת העדיפויות.
 */
export function criterionPenalties(
  input: PenaltyInput,
  priorities: CriterionSetting[],
): number[] {
  return priorities.map((setting) => (setting.enabled ? PENALTY_FN[setting.id](input) : 0));
}

/** פירוט הקנסות לכל קריטריון — לתצוגה למשתמש */
export function penaltyBreakdown(
  input: PenaltyInput,
  priorities: CriterionSetting[],
): { id: CriterionId; enabled: boolean; rank: number; penalty: number; score: number }[] {
  return priorities.map((setting, rank) => {
    const penalty = PENALTY_FN[setting.id](input);
    return {
      id: setting.id,
      enabled: setting.enabled,
      rank,
      penalty,
      // 100 = מושלם, 0 = הכי גרוע
      score: Math.round((1 - penalty) * 100),
    };
  });
}

/**
 * משלים קריטריונים שנוספו בגרסאות מאוחרות, בלי לאבד את הסדר שהמשתמש בחר,
 * ומריץ מיגרציות של ברירות מחדל לפי הגרסה שנשמרה.
 */
export function normalizePriorities(
  saved: CriterionSetting[] | undefined,
  savedVersion = 1,
): CriterionSetting[] {
  if (!saved?.length) return DEFAULT_PRIORITIES;
  const known = saved.filter((s) => s.id in CRITERION_META);
  const missing = DEFAULT_PRIORITIES.filter((d) => !known.some((s) => s.id === d.id));
  const merged = [...known, ...missing];

  // גרסה 2: הכימיה המשחקית עברה לדלוקה כברירת מחדל. מי ששמר הגדרות כשהיא
  // הייתה כבויה יקבל אותה דלוקה פעם אחת; מרגע שיגע בסדר העדיפויות נשמרת
  // הגרסה החדשה, וכיבוי מכוון נשאר מכובה.
  if (savedVersion < 2) {
    return merged.map((s) => (s.id === 'gameChemistry' ? { ...s, enabled: true } : s));
  }
  return merged;
}
