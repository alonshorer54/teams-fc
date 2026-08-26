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
  { id: 'gameChemistry', enabled: false },
  { id: 'affinity', enabled: true },
  { id: 'tags', enabled: true },
];

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
  let total = 0;
  priorities.forEach((setting, rank) => {
    if (!setting.enabled) return;
    total += PENALTY_FN[setting.id](input) * priorityWeight(rank);
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

/** משלים קריטריונים שנוספו בגרסאות מאוחרות, בלי לאבד את הסדר שהמשתמש בחר. */
export function normalizePriorities(saved: CriterionSetting[] | undefined): CriterionSetting[] {
  if (!saved?.length) return DEFAULT_PRIORITIES;
  const known = saved.filter((s) => s.id in CRITERION_META);
  const missing = DEFAULT_PRIORITIES.filter((d) => !known.some((s) => s.id === d.id));
  return [...known, ...missing];
}
