import {
  SPREAD_POSITIONS,
  lineupTeams,
  membersOf,
  type Lineup,
  type Player,
  type Position,
  type TeamId,
} from '../types';

/**
 * הקריטריונים שההגרלה מתחשבת בהם.
 * הסדר ניתן לשינוי, וכל קריטריון אפשר לכבות.
 */
export type CriterionId = 'rating' | 'positions' | 'friends' | 'gameChemistry' | 'affinity';

export interface CriterionSetting {
  id: CriterionId;
  enabled: boolean;
}

/** סדר ברירת המחדל — דירוג ראשון, אחר כך עמדות, חברויות, כימיה משחקית, ואהבה/שנאה */
export const DEFAULT_PRIORITIES: CriterionSetting[] = [
  { id: 'rating', enabled: true },
  { id: 'positions', enabled: true },
  { id: 'friends', enabled: true },
  // דלוק כברירת מחדל: הקנס שלו הוא 0 כל עוד אין אף זוג שעבר את סף המדגם,
  // אז זה פשוט "מתעורר" מעצמו בשבוע שבו נצברו מספיק תוצאות
  { id: 'gameChemistry', enabled: true },
  { id: 'affinity', enabled: true },
];

/**
 * גרסת ברירות המחדל של סדר העדיפויות.
 * העלאה כאן מריצה מיגרציה חד-פעמית אצל מי שכבר שמר הגדרות בענן.
 */
export const PRIORITIES_VERSION = 3;

export const CRITERION_META: Record<
  CriterionId,
  { label: string; help: string; emoji: string }
> = {
  rating: {
    label: 'דירוג',
    emoji: '⭐',
    help: 'משווה את סך הדירוגים בין הקבוצות. זה מה שקובע שהקבוצות שקולות.',
  },
  positions: {
    label: 'עמדות',
    emoji: '🧤',
    help: 'מפזר שווה בין הקבוצות שוערים, הגנה, קישור והתקפה — שלא כל החלוצים ייפלו לאותה קבוצה.',
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
 * הבטחה למשתמש, אז שניהם כמעט לא זזים. עמדות קופצות בשליש שלם על כל שחקן
 * שלא במקומו, והעדפות אישיות מנורמלות לפי מספר המחזיקים — סובלנות אחידה הייתה
 * פוסלת בגללן כל חלופה.
 * הקריטריונים התחתונים הם בדיוק אלה שאמורים לזוז ראשונים.
 */
export const VARIETY_FLEX: Record<CriterionId, number> = {
  rating: 1,
  positions: 2,
  friends: 0,
  gameChemistry: 5,
  affinity: 3,
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

export const TIERS_META = {
  label: 'פיזור רמות',
  emoji: '📶',
  help: 'החזקים והחלשים מתחלקים בין הקבוצות. 100 = כל קבוצה קיבלה אחד מכל רמה.',
};

/** ציון שמוצג לצד הקריטריונים: אחד מהם, או פיזור הרמות שתמיד פעיל */
export type ScoreId = CriterionId | 'tiers';

export const scoreMeta = (id: ScoreId): { label: string; emoji: string; help: string } =>
  id === 'tiers' ? TIERS_META : CRITERION_META[id];

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
  // הסכום נבדק גם הוא: הרכב עם שחקנים אחרים באותה כמות לא יקבל שכבות של אחר.
  // בסובלנות, כי אותם דירוגים בסדר חיבור אחר נבדלים בספרה האחרונה
  const cached = tiersCache.get(ratingOf);
  if (
    cached &&
    cached.width === width &&
    cached.count === count &&
    Math.abs(cached.sum - sum) < 1e-6
  ) {
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

/**
 * כמה כל שחקן שווה בכל עמדה: שחקן של עמדה אחת שווה 1 בה, ושחקן של הגנה וקישור
 * שווה חצי בכל אחת. כך שני שחקנים כאלה באותה קבוצה הם שחקן הגנה ושחקן קישור.
 * מחושב פעם אחת לבריכה, כי הקנס נקרא מהלולאה הפנימית.
 */
const positionCache = new WeakMap<Player[], Map<string, [Position, number][]>>();

const positionsOf = (pool: Player[]): Map<string, [Position, number][]> => {
  let map = positionCache.get(pool);
  if (!map) {
    map = new Map(
      pool.map((p) => {
        const spread = p.positions.filter((pos) => pos !== 'any');
        return [p.id, spread.map((pos) => [pos, 1 / spread.length] as [Position, number])];
      }),
    );
    positionCache.set(pool, map);
  }
  return map;
};

/** שוער כפול באותה קבוצה הוא הבעיה הכי מורגשת על המגרש */
const GOALKEEPER_WEIGHT = 2;

/**
 * כמה שחקנים צריך להעביר כדי שכל עמדה תתחלק שווה. 4 חלוצים ב-3 קבוצות זה
 * 2/1/1; חלוקה של 2/2/0 רחוקה מזה בשחקן אחד, ו-4/0/0 בשניים.
 */
export function misplacedPositions(lineup: Lineup, pool: Player[]): number {
  const active = activeTeams(lineup);
  if (active.length < 2) return 0;
  const positionOf = positionsOf(pool);

  // ספירה אחת לכל קבוצה: counts[team][position]
  const counts = active.map((t) => {
    const byPosition: Partial<Record<Position, number>> = {};
    for (const id of membersOf(lineup, t)) {
      for (const [position, share] of positionOf.get(id) ?? []) {
        byPosition[position] = (byPosition[position] ?? 0) + share;
      }
    }
    return byPosition;
  });

  // חלקים של שליש מצטברים ל-2.9999999999999996, ואז floor ו-ceil טועים בשחקן שלם
  const exact = (n: number) => Math.round(n * 1e6) / 1e6;

  let misplaced = 0;
  for (const position of SPREAD_POSITIONS) {
    let holders = 0;
    for (const team of counts) holders += team[position] ?? 0;
    holders = exact(holders);
    if (!holders) continue;

    const low = Math.floor(holders / active.length);
    const high = Math.ceil(holders / active.length);
    let over = 0;
    let under = 0;
    for (const team of counts) {
      const c = exact(team[position] ?? 0);
      over += Math.max(0, c - high);
      under += Math.max(0, low - c);
    }
    misplaced += Math.max(over, under) * (position === 'gk' ? GOALKEEPER_WEIGHT : 1);
  }
  return misplaced;
}

/**
 * שחקן אחד לא במקום כבר עולה הרבה: בשלוש קבוצות זה שליש מהקנס המלא. כך העמדות
 * מכריעות בין כל החלוקות ששקולות בדירוג, ולא רק שוברות שוויון מדי פעם.
 */
function positionsPenalty({ lineup, pool }: PenaltyInput): number {
  const teams = activeTeams(lineup).length;
  return teams < 2 ? 0 : Math.min(1, misplacedPositions(lineup, pool) / teams);
}

const PENALTY_FN: Record<CriterionId, (input: PenaltyInput) => number> = {
  rating: ratingPenalty,
  friends: friendsPenalty,
  gameChemistry: gameChemistryPenalty,
  affinity: affinityPenalty,
  positions: positionsPenalty,
};

/** קנס כולל משוקלל לפי סדר העדיפויות. ככל שנמוך יותר — החלוקה טובה יותר. */
export function weightedPenalty(input: PenaltyInput, priorities: CriterionSetting[]): number {
  return weighPenalties(tiersPenalty(input), criterionPenalties(input, priorities));
}

/**
 * השקלול עצמו, מקנסות שכבר חושבו — למי שצריך גם את הקנסות בנפרד ולא רוצה
 * לחשב אותם פעמיים. `penalties` מיושר מול סדר העדיפויות, כמו ב-criterionPenalties.
 */
export function weighPenalties(tiers: number, penalties: number[]): number {
  let total = tiers * priorityWeight(TIERS_RANK);
  penalties.forEach((penalty, rank) => {
    total += penalty * priorityWeight(rank < TIERS_RANK ? rank : rank + 1);
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
  let result = merged;
  if (savedVersion < 2) {
    result = result.map((s) => (s.id === 'gameChemistry' ? { ...s, enabled: true } : s));
  }
  // גרסה 3: התגיות הוחלפו בעמדות. קריטריון חדש היה נכנס בסוף הרשימה, שם הוא
  // כמעט לא משפיע — אז פעם אחת הוא עובר למקום השני, מיד אחרי הקריטריון העליון
  if (savedVersion < 3) {
    const positions = result.find((s) => s.id === 'positions')!;
    const rest = result.filter((s) => s.id !== 'positions');
    result = [rest[0], { ...positions, enabled: true }, ...rest.slice(1)];
  }
  return result;
}
