import {
  DEFAULT_TEAM_COUNT,
  cloneLineup,
  defaultTeamIds,
  emptyLineup,
  lineupTeams,
  membersOf,
  type Lineup,
  type Player,
  type TeamId,
} from '../types';
import {
  VARIETY_FLEX,
  criterionPenalties,
  weightedPenalty,
  type CriterionSetting,
  type PenaltyInput,
} from './criteria';

/** קנס על סטייה מגודל הקבוצה היעד — תמיד מעל הכל, אחרת החלוקה לא חוקית */
const W_SIZE = 5000;

export interface TeamStats {
  count: number;
  /** סכום הדירוגים — "כמה הקבוצה שווה על הנייר" */
  total: number;
  avg: number;
  /** מספר קשרי חברות שנשמרו בתוך הקבוצה */
  bondsKept: number;
  /** הבונוס שכימיית החברויות מוסיפה, בנקודות דירוג */
  chemistryBonus: number;
  /** הבונוס שהכימיה המשחקית הנלמדת מוסיפה, בנקודות דירוג */
  gameBonus: number;
  /** דירוג + שני הבונוסים — האומדן ה"אמיתי" לחוזק הקבוצה */
  combined: number;
  /** כמה שחקנים מכל תגית יש בקבוצה */
  tagCounts: Record<string, number>;
}

/** כמה נקודות דירוג שווה זוג חברים שמשחקים יחד. */
export const CHEMISTRY_BONUS_PER_BOND = 0.3;

/**
 * המרה בין "אפקט" של כימיה משחקית (הפרש באחוזי ניצחון) לנקודות דירוג.
 * זוג עם אפקט של 25% שווה חצי נקודת דירוג לקבוצה שלו.
 */
export const GAME_CHEMISTRY_POINTS = 2;

/** מפתח אחיד לזוג שחקנים, ללא תלות בסדר */
export const pairKey = (a: string, b: string) => [a, b].sort().join('|');

export interface LineupStats {
  teams: Partial<Record<TeamId, TeamStats>>;
  /** הפרש בין הממוצע הגבוה לממוצע הנמוך */
  spread: number;
  /** הפרש בין סכום הדירוגים הגבוה לנמוך */
  totalSpread: number;
  /** הפרש בין הציון המשוקלל הגבוה לנמוך */
  combinedSpread: number;
  bondsKept: number;
  bondsBroken: number;
  totalBonds: number;
}

/** זוג חברים, ממוין לפי מזהה כדי למנוע כפילויות. */
export type Bond = readonly [string, string];

/** מחלץ את כל קשרי החברות בין שחקנים שנמצאים בבריכת הנבחרים. */
export function extractBonds(pool: Player[]): Bond[] {
  const ids = new Set(pool.map((p) => p.id));
  const seen = new Set<string>();
  const bonds: Bond[] = [];

  for (const p of pool) {
    for (const friendId of p.friendIds) {
      if (friendId === p.id || !ids.has(friendId)) continue;
      const key = pairKey(p.id, friendId);
      if (seen.has(key)) continue;
      seen.add(key);
      bonds.push([p.id, friendId] as const);
    }
  }
  return bonds;
}

/** סכום האפקטים של הזוגות שנמצאים באותה קבוצה, בנקודות דירוג. */
export function gameChemistryBonus(members: string[], effects: Map<string, number>): number {
  if (!effects.size) return 0;
  let sum = 0;
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      sum += effects.get(pairKey(members[i], members[j])) ?? 0;
    }
  }
  return sum * GAME_CHEMISTRY_POINTS;
}

/** גדלי הקבוצות: מחלק את השחקנים שווה בשווה, והשארית הולכת לקבוצות הראשונות. */
export function teamSizes(total: number, teamIds: readonly TeamId[]): Record<string, number> {
  const count = teamIds.length;
  if (!count) return {};

  const base = Math.floor(total / count);
  const rest = total % count;
  return Object.fromEntries(teamIds.map((t, i) => [t, base + (i < rest ? 1 : 0)]));
}

/** רשימת הגדלים בלבד, לטקסטים כמו "7 / 7 / 6". */
export const teamSizeList = (total: number, teamCount: number): number[] => {
  const base = Math.floor(total / teamCount);
  const rest = total % teamCount;
  return Array.from({ length: teamCount }, (_, i) => base + (i < rest ? 1 : 0));
};

/**
 * כמה שחקנים חסרים כדי שכל הקבוצות יצאו בדיוק באותו גודל.
 * 20 שחקנים ב-3 קבוצות => חסר אחד, כי 21 מתחלק ל-7/7/7.
 */
export const missingForEvenTeams = (total: number, teamCount: number): number => {
  const rest = total % teamCount;
  return rest === 0 ? 0 : teamCount - rest;
};

/* ------------------------------------------------------------------ */
/*  סטטיסטיקות                                                         */
/* ------------------------------------------------------------------ */

export function computeStats(
  lineup: Lineup,
  pool: Player[],
  /** אפקטים נלמדים לזוגות; ריק = הכימיה המשחקית כבויה */
  pairEffects: Map<string, number> = new Map(),
): LineupStats {
  const byId = new Map(pool.map((p) => [p.id, p]));
  const bonds = extractBonds(pool);
  const present = lineupTeams(lineup);
  const teamOf = new Map<string, TeamId>();
  for (const t of present) for (const id of membersOf(lineup, t)) teamOf.set(id, t);

  const teams: Partial<Record<TeamId, TeamStats>> = {};
  for (const t of present) {
    const members = membersOf(lineup, t);
    const total = members.reduce((s, id) => s + (byId.get(id)?.rating ?? 0), 0);

    const tagCounts: Record<string, number> = {};
    for (const id of members) {
      for (const tag of byId.get(id)?.tags ?? []) {
        tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
      }
    }

    teams[t] = {
      count: members.length,
      total: round1(total),
      avg: members.length ? total / members.length : 0,
      bondsKept: 0,
      chemistryBonus: 0,
      gameBonus: round1(gameChemistryBonus(members, pairEffects)),
      combined: round1(total),
      tagCounts,
    };
  }

  let bondsKept = 0;
  for (const [a, b] of bonds) {
    const ta = teamOf.get(a);
    const tb = teamOf.get(b);
    if (ta && tb && ta === tb) {
      bondsKept++;
      teams[ta]!.bondsKept++;
    }
  }

  for (const t of present) {
    const stats = teams[t]!;
    stats.chemistryBonus = round1(stats.bondsKept * CHEMISTRY_BONUS_PER_BOND);
    stats.combined = round1(stats.total + stats.chemistryBonus + stats.gameBonus);
  }

  const active = present.filter((t) => teams[t]!.count > 0);
  const spreadOf = (pick: (t: TeamStats) => number) => {
    if (!active.length) return 0;
    const values = active.map((t) => pick(teams[t]!));
    return Math.max(...values) - Math.min(...values);
  };

  return {
    teams,
    spread: spreadOf((t) => t.avg),
    totalSpread: spreadOf((t) => t.total),
    combinedSpread: spreadOf((t) => t.combined),
    bondsKept,
    bondsBroken: bonds.length - bondsKept,
    totalBonds: bonds.length,
  };
}

/** בודק מי מהחברים של שחקן נמצא איתו באותה קבוצה. */
export function bondStatus(
  playerId: string,
  lineup: Lineup,
  pool: Player[],
): { hasBond: boolean; together: boolean; partnerNames: string[] } {
  const byId = new Map(pool.map((p) => [p.id, p]));
  const teamOf = new Map<string, TeamId>();
  for (const t of lineupTeams(lineup)) for (const id of membersOf(lineup, t)) teamOf.set(id, t);

  const partners = (byId.get(playerId)?.friendIds ?? []).filter((id) => byId.has(id));
  if (!partners.length) return { hasBond: false, together: false, partnerNames: [] };

  const myTeam = teamOf.get(playerId);
  return {
    hasBond: true,
    together: partners.some((id) => teamOf.get(id) === myTeam),
    partnerNames: partners.map((id) => byId.get(id)?.name ?? '').filter(Boolean),
  };
}

/* ------------------------------------------------------------------ */
/*  בניית "אשכולות כימיה" (Union-Find על קשרי החברות)                   */
/* ------------------------------------------------------------------ */

function buildClusters(pool: Player[], bonds: Bond[], maxSize: number): string[][] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    while (parent.get(x) !== root) {
      const next = parent.get(x)!;
      parent.set(x, root);
      x = next;
    }
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const p of pool) parent.set(p.id, p.id);
  for (const [a, b] of bonds) union(a, b);

  const groups = new Map<string, string[]>();
  for (const p of pool) {
    const root = find(p.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(p.id);
  }

  // אשכול גדול מקיבולת קבוצה — נפצל לחלקים כדי שהחלוקה תישאר אפשרית
  const clusters: string[][] = [];
  for (const members of groups.values()) {
    for (let i = 0; i < members.length; i += maxSize) {
      clusters.push(members.slice(i, i + maxSize));
    }
  }
  return clusters;
}

/* ------------------------------------------------------------------ */
/*  פונקציית העלות                                                     */
/* ------------------------------------------------------------------ */

function cost(
  lineup: Lineup,
  input: Omit<PenaltyInput, 'lineup'>,
  sizes: Record<string, number>,
  teamIds: readonly TeamId[],
  priorities: CriterionSetting[],
): number {
  let sizePenalty = 0;
  for (const t of teamIds) sizePenalty += Math.abs(membersOf(lineup, t).length - (sizes[t] ?? 0));

  return weightedPenalty({ ...input, lineup }, priorities) + sizePenalty * W_SIZE;
}

/* ------------------------------------------------------------------ */
/*  שלב 1: בנייה חמדנית עם רעש אקראי                                    */
/* ------------------------------------------------------------------ */

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function greedyBuild(
  clusters: string[][],
  ratingOf: Map<string, number>,
  sizes: Record<string, number>,
  teamIds: readonly TeamId[],
): Lineup {
  const sumOf = (ids: string[]) => ids.reduce((s, id) => s + (ratingOf.get(id) ?? 0), 0);

  // אשכולות גדולים/חזקים משובצים ראשונים, עם ג'יטר אקראי כדי לגוון בין הגרלות
  const ordered = shuffle(clusters).sort((a, b) => {
    const byLen = b.length - a.length;
    if (byLen !== 0) return byLen;
    return sumOf(b) - sumOf(a) + (Math.random() - 0.5) * 0.6;
  });

  const lineup = emptyLineup(teamIds);
  const totals: Record<string, number> = Object.fromEntries(teamIds.map((t) => [t, 0]));

  for (const cluster of ordered) {
    const feasible = teamIds.filter(
      (t) => lineup[t]!.length + cluster.length <= (sizes[t] ?? 0),
    );
    const candidates = feasible.length ? feasible : [...teamIds];

    const ranked = [...candidates].sort((a, b) => {
      const pa = (totals[a] + sumOf(cluster)) / Math.max(1, lineup[a]!.length + cluster.length);
      const pb = (totals[b] + sumOf(cluster)) / Math.max(1, lineup[b]!.length + cluster.length);
      return pa - pb;
    });

    // ב-25% מהמקרים נבחר את האפשרות השנייה הטובה — מקור הגיוון בין הגרלות
    const pick = ranked.length > 1 && Math.random() < 0.25 ? ranked[1] : ranked[0];
    lineup[pick]!.push(...cluster);
    totals[pick] += sumOf(cluster);
  }

  return lineup;
}

/* ------------------------------------------------------------------ */
/*  שלב 2: חיפוש מקומי — החלפות זוגיות שמשפרות את העלות                 */
/* ------------------------------------------------------------------ */

function localSearch(
  lineup: Lineup,
  input: Omit<PenaltyInput, 'lineup'>,
  sizes: Record<string, number>,
  teamIds: readonly TeamId[],
  priorities: CriterionSetting[],
  /** תוספת לעלות שמושכת את החיפוש הצידה — משמשת לחיפוש חלוקות חלופיות */
  bias?: (lineup: Lineup) => number,
): Lineup {
  const current = cloneLineup(lineup);
  const total = (l: Lineup) =>
    cost(l, input, sizes, teamIds, priorities) + (bias ? bias(l) : 0);
  let best = total(current);

  for (let pass = 0; pass < 40; pass++) {
    let improved = false;

    for (let i = 0; i < teamIds.length; i++) {
      for (let j = i + 1; j < teamIds.length; j++) {
        const ta = current[teamIds[i]];
        const tb = current[teamIds[j]];
        if (!ta || !tb) continue;

        for (let a = 0; a < ta.length; a++) {
          for (let b = 0; b < tb.length; b++) {
            [ta[a], tb[b]] = [tb[b], ta[a]];
            const next = total(current);
            if (next < best - 1e-9) {
              best = next;
              improved = true;
            } else {
              [ta[a], tb[b]] = [tb[b], ta[a]];
            }
          }
        }
      }
    }

    if (!improved) break;
  }

  return current;
}

/* ------------------------------------------------------------------ */
/*  גיוון בין הגרלה להגרלה                                              */
/* ------------------------------------------------------------------ */

/**
 * סובלנות הבסיס: כמה מותר לחלוקה שנבחרת להיות פחות טובה מהטובה ביותר.
 * כל קריטריון מכפיל אותה ב-`VARIETY_FLEX` שלו, כי לא כולם שווים כאן.
 *
 * בדירוג המכפיל הוא 1, כלומר חמש מאיות של נקודה בפער הממוצעים בין הקבוצות —
 * בקבוצה של 7 זה שליש נקודת דירוג בסך הכל, לא מורגש על המגרש. בחברויות
 * המכפיל הוא 0: חלופה לא נבחרת אם היא שוברת אפילו חברות אחת יותר מהמובילה.
 */
export const VARIETY_TOLERANCE = 0.05;

/** כמה הגרלות אחורה נלקחות בחשבון כשמחפשים גיוון */
export const VARIETY_MEMORY = 4;

/** דעיכת המשקל לכל הגרלה נוספת אחורה: האחרונה 1, שלפניה 0.6, וכן הלאה */
const MEMORY_DECAY = 0.6;

/**
 * כמה חזק לדחוף את חיפוש האלטרנטיבות הצידה, בעלות.
 * גדול מספיק כדי להוציא את החיפוש מהעמק שבו הוא נתקע, וקטן מספיק שמה שייצא
 * עדיין יעבור את מסנן האיכות — שהוא ממילא זה שמגן על האיזון.
 */
const W_REPEAT = 300;

/**
 * חתימה קנונית של חלוקה: לא תלויה בצבע שקיבלה כל קבוצה ולא בסדר בתוך הקבוצה.
 * שתי חלוקות עם אותה חתימה הן אותן קבוצות בדיוק.
 */
export function lineupKey(lineup: Lineup): string {
  return lineupTeams(lineup)
    .map((t) => [...membersOf(lineup, t)].sort().join(','))
    .sort()
    .join('|');
}

/**
 * משקל לכל זוג שחקנים לפי כמה לאחרונה הם שובצו יחד.
 * מקבל הרכבים מהחדש לישן; הרכבים זהים נספרים פעם אחת בלבד.
 */
export function recentPairWeights(
  lineups: Lineup[],
  memory = VARIETY_MEMORY,
): Map<string, number> {
  const weights = new Map<string, number>();
  const seen = new Set<string>();
  let rank = 0;

  for (const lineup of lineups) {
    if (rank >= memory) break;
    const key = lineupKey(lineup);
    if (seen.has(key)) continue;
    seen.add(key);

    const weight = Math.pow(MEMORY_DECAY, rank++);
    for (const t of lineupTeams(lineup)) {
      const members = membersOf(lineup, t);
      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
          const k = pairKey(members[i], members[j]);
          weights.set(k, (weights.get(k) ?? 0) + weight);
        }
      }
    }
  }
  return weights;
}

/** מפתחות הזוגות שהם קשר חברות — אלה שאמורים לחזור יחד. */
const bondedPairs = (bonds: Bond[]): Set<string> =>
  new Set(bonds.map(([a, b]) => pairKey(a, b)));

/**
 * כמה החלוקה הזו "שוב אותו דבר" ביחס להגרלות האחרונות. נמוך = מגוון יותר.
 * זוגות חברים לא נספרים: הם אמורים לחזור יחד, וזה לא נחשב חוסר גיוון.
 */
function repeatScore(lineup: Lineup, recent: Map<string, number>, bonded: Set<string>): number {
  if (!recent.size) return 0;

  let sum = 0;
  for (const t of lineupTeams(lineup)) {
    const members = membersOf(lineup, t);
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const k = pairKey(members[i], members[j]);
        if (bonded.has(k)) continue;
        sum += recent.get(k) ?? 0;
      }
    }
  }
  return sum;
}

/** סך המשקל שאפשר לצבור מהצירופים הישנים — המכנה שמנרמל את קנס החזרתיות. */
const totalWeight = (recent: Map<string, number>): number => {
  let sum = 0;
  for (const w of recent.values()) sum += w;
  return sum;
};

/**
 * טבלת דחייה מספרית: משקל לכל זוג שחקנים, לפי מיקומם בבריכה.
 *
 * הפונקציה הזו נקראת מתוך הלולאה הפנימית של החיפוש, מיליוני פעמים בהגרלה
 * אחת. `pairKey` בונה שם מערך ומחרוזת בכל קריאה, וזה לבדו הכפיל את זמן
 * ההגרלה — לכן כאן הכול נפרש מראש למערך שטוח שנקרא באינדקס.
 */
function repulsionTable(
  pool: Player[],
  repulsion: Map<string, number>,
  bonded: Set<string>,
): { indexOf: Map<string, number>; weights: Float64Array; size: number } {
  const indexOf = new Map(pool.map((p, i) => [p.id, i]));
  const size = pool.length;
  const weights = new Float64Array(size * size);

  for (const [key, weight] of repulsion) {
    // זוגות חברים אמורים לחזור יחד — אין להם משקל דחייה
    if (bonded.has(key)) continue;
    const [a, b] = key.split('|');
    const ia = indexOf.get(a);
    const ib = indexOf.get(b);
    if (ia === undefined || ib === undefined) continue;
    weights[ia * size + ib] = weight;
    weights[ib * size + ia] = weight;
  }
  return { indexOf, weights, size };
}

/**
 * כמה שחקנים להזיז ב"בעיטה" לפני ירידה מחדש.
 * מעט מדי וחוזרים בדיוק לאותו מקום; הרבה מדי וזו כבר הגרלה מאפס.
 */
const KICK_SWAPS = 3;

/** מחליף כמה זוגות אקראיים בין קבוצות — נקודת פתיחה חדשה בסביבת החלוקה הטובה. */
function kick(lineup: Lineup, teamIds: readonly TeamId[]): Lineup {
  const next = cloneLineup(lineup);
  if (teamIds.length < 2) return next;

  for (let k = 0; k < KICK_SWAPS; k++) {
    const i = Math.floor(Math.random() * teamIds.length);
    let j = Math.floor(Math.random() * (teamIds.length - 1));
    if (j >= i) j++;

    const ta = next[teamIds[i]];
    const tb = next[teamIds[j]];
    if (!ta?.length || !tb?.length) continue;

    const a = Math.floor(Math.random() * ta.length);
    const b = Math.floor(Math.random() * tb.length);
    [ta[a], tb[b]] = [tb[b], ta[a]];
  }
  return next;
}

/**
 * סידור השחקנים בתוך כל קבוצה לפי שם.
 * בלי זה סדר המערך משקף את מהלך האלגוריתם, והגרלה שהחזירה בדיוק את אותן
 * קבוצות נראית על המסך כאילו משהו בכל זאת השתנה.
 */
function sortMembers(lineup: Lineup, pool: Player[]): Lineup {
  const nameOf = new Map(pool.map((p) => [p.id, p.name]));
  const next = cloneLineup(lineup);
  for (const t of lineupTeams(next)) {
    next[t] = next[t]!.sort((a, b) =>
      (nameOf.get(a) ?? '').localeCompare(nameOf.get(b) ?? '', 'he'),
    );
  }
  return next;
}

/* ------------------------------------------------------------------ */
/*  נקודת הכניסה: הגרלת קבוצות מאוזנות                                   */
/* ------------------------------------------------------------------ */

export interface GenerateOptions {
  /** מספר ניסיונות עצמאיים; מתוכם נבחרת החלוקה שתוחזר */
  restarts?: number;
  /** סדר העדיפויות שהמשתמש הגדיר */
  priorities: CriterionSetting[];
  /** אפקטים נלמדים לזוגות */
  pairEffects?: Map<string, number>;
  /** הצבעים שישתתפו בהגרלה. ברירת מחדל: שלוש הקבוצות הקלאסיות. */
  teamIds?: readonly TeamId[];
  /**
   * משקל לכל זוג ששובץ יחד בהגרלות האחרונות (ראו `recentPairWeights`).
   * מבין החלוקות ששקולות באיכותן תיבחר זו שמפרקת הכי הרבה צירופים חוזרים.
   */
  recentPairs?: Map<string, number>;
  /** סובלנות הגיוון; 0 = תמיד החלוקה הטובה ביותר בלבד */
  variety?: number;
}

/** מועמדת לחלוקה: ההרכב עצמו, איכותו, וכמה הוא חורג מגדלי הקבוצות. */
interface Candidate {
  lineup: Lineup;
  cost: number;
  penalties: number[];
  sizeOff: number;
}

export function generateLineup(pool: Player[], options: GenerateOptions): Lineup {
  const restarts = options.restarts ?? 60;
  const { priorities } = options;
  const pairEffects = options.pairEffects ?? new Map<string, number>();
  const recent = options.recentPairs ?? new Map<string, number>();
  const tolerance = options.variety ?? VARIETY_TOLERANCE;
  const teamIds = options.teamIds?.length
    ? options.teamIds
    : defaultTeamIds(DEFAULT_TEAM_COUNT);

  if (pool.length === 0) return emptyLineup(teamIds);

  const ratingOf = new Map(pool.map((p) => [p.id, p.rating]));
  const bonds = extractBonds(pool);
  const sizes = teamSizes(pool.length, teamIds);
  const maxSize = Math.max(...teamIds.map((t) => sizes[t] ?? 0), 1);

  // אשכולות החברויות משמשים כנקודת פתיחה רק כשהחברויות בכלל נלקחות בחשבון
  const friendsOn = priorities.find((p) => p.id === 'friends')?.enabled;
  const clusters = friendsOn ? buildClusters(pool, bonds, maxSize) : pool.map((p) => [p.id]);

  const input = { pool, ratingOf, pairEffects };
  const sizeOffOf = (lineup: Lineup) =>
    teamIds.reduce((s, t) => s + Math.abs(membersOf(lineup, t).length - (sizes[t] ?? 0)), 0);

  // כל החלוקות השונות שנמצאו, לפי חתימה — כדי שאותה חלוקה לא תישקל פעמיים
  const found = new Map<string, Candidate>();
  let best: Candidate | null = null;

  const consider = (lineup: Lineup): Candidate => {
    const key = lineupKey(lineup);
    const known = found.get(key);
    if (known) return known;

    const candidate: Candidate = {
      lineup,
      cost: cost(lineup, input, sizes, teamIds, priorities),
      penalties: criterionPenalties({ ...input, lineup }, priorities),
      sizeOff: sizeOffOf(lineup),
    };
    found.set(key, candidate);
    if (!best || candidate.cost < best.cost) best = candidate;
    return candidate;
  };

  /*
   * תקציב הניסיונות מתחלק בין שני השלבים, כדי שהגרלה תישאר מיידית: חיפוש
   * האלטרנטיבות יוצא מחלוקה טובה ולכן מתכנס מהר, ואין צורך לתת לו יותר.
   */
  const opening_restarts = Math.ceil(restarts / 2);
  const alternative_restarts = restarts - opening_restarts;

  // שלב א' — חיפוש רגיל: מוצא נקודת מוצא טובה
  for (let i = 0; i < opening_restarts; i++) {
    consider(
      localSearch(greedyBuild(clusters, ratingOf, sizes, teamIds), input, sizes, teamIds, priorities),
    );
  }

  if (!best) return emptyLineup(teamIds);
  // נקודת המוצא לבעיטות; רף האיכות עצמו נקבע רק אחרי ששני השלבים סיימו
  const opening: Candidate = best;

  /*
   * שלב ב' — חיפוש אלטרנטיבות.
   *
   * שלב א' לבדו לא מספיק: החיפוש המקומי יורד תמיד לאותו עמק, ובבריכות קטנות
   * כל 60 הריסטארטים מחזירים בדיוק את אותה חלוקה. אז אין בין מה לבחור, וזו
   * הסיבה ש"הגרלה מחדש" עדיין החזירה את אותן קבוצות.
   *
   * כאן מחפשים חלוקות אחרות במפורש: בועטים בחלוקה המובילה (כמה החלפות
   * אקראיות) ויורדים מחדש — הפעם עם דחייה מהצירופים שכבר היו, שמושכת את
   * החיפוש לעמק אחר. מה שיוצא נשקל מול אותו רף איכות, אז זה לא יכול להוזיל
   * את האיזון; זה רק מרחיב את מבחר החלוקות ששוות לו.
   */
  if (tolerance > 0) {
    // בהגרלה ראשונה אין היסטוריה, אז מתרחקים לפחות מהחלוקה המובילה עצמה
    const repulsion = new Map(recent);
    for (const t of lineupTeams(opening.lineup)) {
      const members = membersOf(opening.lineup, t);
      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
          const k = pairKey(members[i], members[j]);
          repulsion.set(k, (repulsion.get(k) ?? 0) + 1);
        }
      }
    }

    const bonded = bondedPairs(bonds);
    const denominator = totalWeight(repulsion);
    const { indexOf, weights, size } = repulsionTable(pool, repulsion, bonded);
    const scale = denominator ? W_REPEAT / denominator : 0;

    const bias = (lineup: Lineup): number => {
      if (!scale) return 0;
      let sum = 0;
      for (const t of teamIds) {
        const members = lineup[t];
        if (!members) continue;
        for (let i = 0; i < members.length; i++) {
          const ia = indexOf.get(members[i]);
          if (ia === undefined) continue;
          const row = ia * size;
          for (let j = i + 1; j < members.length; j++) {
            const ib = indexOf.get(members[j]);
            if (ib !== undefined) sum += weights[row + ib];
          }
        }
      }
      return sum * scale;
    };

    for (let i = 0; i < alternative_restarts; i++) {
      consider(localSearch(kick(opening.lineup, teamIds), input, sizes, teamIds, priorities, bias));
    }
  }

  /*
   * מכאן הגיוון. במקום להחזיר תמיד את המינימום המוחלט — שהוא כמעט תמיד אותה
   * חלוקה בדיוק, ולכן "הגרלה מחדש" לא שינתה כלום — אוספים את כל החלוקות
   * ששקולות לה מעשית, ומתוכן בוחרים את זו שהכי מפרקת את הצירופים האחרונים.
   */
  /*
   * רף האיכות נקבע על פני שני השלבים גם יחד: לפעמים דווקא חיפוש האלטרנטיבות
   * נוחת על חלוקה טובה מזו של השלב הראשון, ואז היא זו שקובעת מול מה משווים.
   */
  const leader: Candidate = best;
  const eligible = [...found.values()].filter(
    (c) =>
      c.sizeOff <= leader.sizeOff &&
      priorities.every(
        (setting, rank) =>
          !setting.enabled ||
          c.penalties[rank] <= leader.penalties[rank] + tolerance * VARIETY_FLEX[setting.id] + 1e-9,
      ),
  );

  let winners: Lineup[] = [leader.lineup];
  if (tolerance > 0 && eligible.length > 1) {
    const bonded = bondedPairs(bonds);
    let bestScore = Infinity;
    winners = [];
    for (const c of eligible) {
      const score = repeatScore(c.lineup, recent, bonded);
      if (score < bestScore - 1e-9) {
        bestScore = score;
        winners = [c.lineup];
      } else if (score <= bestScore + 1e-9) {
        winners.push(c.lineup);
      }
    }
  }

  // בלי היסטוריה כל המועמדות מקבלות אותו ציון, ואז ההגרלה באמת מגרילה ביניהן
  return sortMembers(winners[Math.floor(Math.random() * winners.length)], pool);
}

/* ------------------------------------------------------------------ */
/*  תיאור הקשרים לתצוגה                                                */
/* ------------------------------------------------------------------ */

export interface BondView {
  aId: string;
  bId: string;
  aName: string;
  bName: string;
  together: boolean;
  team: TeamId | null;
  kind: 'friend' | 'love' | 'hate';
}

/** רשימה קריאה של כל הקשרים ומצבם — חברויות, אהבה ושנאה. */
export function describeBonds(lineup: Lineup, pool: Player[]): BondView[] {
  const byId = new Map(pool.map((p) => [p.id, p]));
  const teamOf = new Map<string, TeamId>();
  for (const t of lineupTeams(lineup)) for (const id of membersOf(lineup, t)) teamOf.set(id, t);

  const views: BondView[] = [];
  const seen = new Set<string>();

  const add = (a: string, b: string, kind: BondView['kind']) => {
    const key = `${kind}:${pairKey(a, b)}`;
    if (seen.has(key) || !byId.has(b)) return;
    seen.add(key);

    const ta = teamOf.get(a) ?? null;
    const tb = teamOf.get(b) ?? null;
    const together = !!ta && ta === tb;
    views.push({
      aId: a,
      bId: b,
      aName: byId.get(a)?.name ?? '',
      bName: byId.get(b)?.name ?? '',
      together,
      team: together ? ta : null,
      kind,
    });
  };

  for (const p of pool) {
    for (const id of p.friendIds) add(p.id, id, 'friend');
    for (const id of p.loveIds) add(p.id, id, 'love');
    for (const id of p.hateIds) add(p.id, id, 'hate');
  }

  // קשרים שלא כובדו מוצגים ראשונים — הם מה שמעניין לבדוק
  const satisfied = (v: BondView) => (v.kind === 'hate' ? !v.together : v.together);
  return views.sort(
    (x, y) => Number(satisfied(x)) - Number(satisfied(y)) || x.aName.localeCompare(y.aName, 'he'),
  );
}

/* ------------------------------------------------------------------ */
/*  עריכה ידנית                                                        */
/* ------------------------------------------------------------------ */

export function findTeamOf(lineup: Lineup, playerId: string): TeamId | null {
  for (const t of lineupTeams(lineup)) if (membersOf(lineup, t).includes(playerId)) return t;
  return null;
}

/** מחליף בין שני שחקנים; אם הם באותה קבוצה — לא קורה כלום. */
export function swapPlayers(lineup: Lineup, aId: string, bId: string): Lineup {
  const ta = findTeamOf(lineup, aId);
  const tb = findTeamOf(lineup, bId);
  if (!ta || !tb || ta === tb) return lineup;

  const next = cloneLineup(lineup);
  next[ta]![next[ta]!.indexOf(aId)] = bId;
  next[tb]![next[tb]!.indexOf(bId)] = aId;
  return next;
}

/** מעביר שחקן לקבוצה אחרת (גדלי הקבוצות עשויים להשתנות). */
export function movePlayer(lineup: Lineup, playerId: string, to: TeamId): Lineup {
  const from = findTeamOf(lineup, playerId);
  if (!from || from === to || !(to in lineup)) return lineup;

  const next = cloneLineup(lineup);
  next[from] = next[from]!.filter((id) => id !== playerId);
  next[to] = [...next[to]!, playerId];
  return next;
}

/** מסיר שחקן מכל הקבוצות — למשל כשהוא נמחק מהמאגר. */
export function removeFromLineup(lineup: Lineup, playerId: string): Lineup {
  const next = cloneLineup(lineup);
  for (const t of lineupTeams(next)) {
    next[t] = next[t]!.filter((id) => id !== playerId);
  }
  return next;
}

export const round1 = (n: number) => Math.round(n * 10) / 10;
export const fmtRating = (n: number) => n.toFixed(1);
export const fmtAvg = (n: number) => n.toFixed(2);
