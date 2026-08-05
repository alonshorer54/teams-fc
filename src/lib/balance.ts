import { TEAM_IDS, emptyLineup, type Lineup, type Player, type TeamId } from '../types';
import {
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
  teams: Record<TeamId, TeamStats>;
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
export function teamSizes(total: number): Record<TeamId, number> {
  const base = Math.floor(total / 3);
  const rest = total % 3;
  return {
    white: base + (rest > 0 ? 1 : 0),
    black: base + (rest > 1 ? 1 : 0),
    colored: base,
  };
}

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
  const teamOf = new Map<string, TeamId>();
  for (const t of TEAM_IDS) for (const id of lineup[t]) teamOf.set(id, t);

  const teams = {} as Record<TeamId, TeamStats>;
  for (const t of TEAM_IDS) {
    const members = lineup[t];
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
      teams[ta].bondsKept++;
    }
  }

  for (const t of TEAM_IDS) {
    teams[t].chemistryBonus = round1(teams[t].bondsKept * CHEMISTRY_BONUS_PER_BOND);
    teams[t].combined = round1(teams[t].total + teams[t].chemistryBonus + teams[t].gameBonus);
  }

  const active = TEAM_IDS.filter((t) => teams[t].count > 0);
  const spreadOf = (pick: (t: TeamId) => number) => {
    if (!active.length) return 0;
    const values = active.map(pick);
    return Math.max(...values) - Math.min(...values);
  };

  return {
    teams,
    spread: spreadOf((t) => teams[t].avg),
    totalSpread: spreadOf((t) => teams[t].total),
    combinedSpread: spreadOf((t) => teams[t].combined),
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
  for (const t of TEAM_IDS) for (const id of lineup[t]) teamOf.set(id, t);

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
  sizes: Record<TeamId, number>,
  priorities: CriterionSetting[],
): number {
  let sizePenalty = 0;
  for (const t of TEAM_IDS) sizePenalty += Math.abs(lineup[t].length - sizes[t]);

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
  sizes: Record<TeamId, number>,
): Lineup {
  const sumOf = (ids: string[]) => ids.reduce((s, id) => s + (ratingOf.get(id) ?? 0), 0);

  // אשכולות גדולים/חזקים משובצים ראשונים, עם ג'יטר אקראי כדי לגוון בין הגרלות
  const ordered = shuffle(clusters).sort((a, b) => {
    const byLen = b.length - a.length;
    if (byLen !== 0) return byLen;
    return sumOf(b) - sumOf(a) + (Math.random() - 0.5) * 0.6;
  });

  const lineup = emptyLineup();
  const totals: Record<TeamId, number> = { white: 0, black: 0, colored: 0 };

  for (const cluster of ordered) {
    const feasible = TEAM_IDS.filter((t) => lineup[t].length + cluster.length <= sizes[t]);
    const candidates = feasible.length ? feasible : [...TEAM_IDS];

    const ranked = [...candidates].sort((a, b) => {
      const pa = (totals[a] + sumOf(cluster)) / Math.max(1, lineup[a].length + cluster.length);
      const pb = (totals[b] + sumOf(cluster)) / Math.max(1, lineup[b].length + cluster.length);
      return pa - pb;
    });

    // ב-25% מהמקרים נבחר את האפשרות השנייה הטובה — מקור הגיוון בין הגרלות
    const pick = ranked.length > 1 && Math.random() < 0.25 ? ranked[1] : ranked[0];
    lineup[pick].push(...cluster);
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
  sizes: Record<TeamId, number>,
  priorities: CriterionSetting[],
): Lineup {
  const current: Lineup = {
    white: [...lineup.white],
    black: [...lineup.black],
    colored: [...lineup.colored],
  };
  let best = cost(current, input, sizes, priorities);

  for (let pass = 0; pass < 40; pass++) {
    let improved = false;

    for (let i = 0; i < TEAM_IDS.length; i++) {
      for (let j = i + 1; j < TEAM_IDS.length; j++) {
        const ta = TEAM_IDS[i];
        const tb = TEAM_IDS[j];

        for (let a = 0; a < current[ta].length; a++) {
          for (let b = 0; b < current[tb].length; b++) {
            [current[ta][a], current[tb][b]] = [current[tb][b], current[ta][a]];
            const next = cost(current, input, sizes, priorities);
            if (next < best - 1e-9) {
              best = next;
              improved = true;
            } else {
              [current[ta][a], current[tb][b]] = [current[tb][b], current[ta][a]];
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
/*  נקודת הכניסה: הגרלת כוחות מאוזנים                                   */
/* ------------------------------------------------------------------ */

export interface GenerateOptions {
  /** מספר ניסיונות עצמאיים; מתוכם נבחר הטוב ביותר */
  restarts?: number;
  /** סדר העדיפויות שהמשתמש הגדיר */
  priorities: CriterionSetting[];
  /** אפקטים נלמדים לזוגות */
  pairEffects?: Map<string, number>;
}

export function generateLineup(pool: Player[], options: GenerateOptions): Lineup {
  const restarts = options.restarts ?? 60;
  const { priorities } = options;
  const pairEffects = options.pairEffects ?? new Map<string, number>();
  if (pool.length === 0) return emptyLineup();

  const ratingOf = new Map(pool.map((p) => [p.id, p.rating]));
  const bonds = extractBonds(pool);
  const sizes = teamSizes(pool.length);
  const maxSize = Math.max(sizes.white, sizes.black, sizes.colored);

  // אשכולות החברויות משמשים כנקודת פתיחה רק כשהחברויות בכלל נלקחות בחשבון
  const friendsOn = priorities.find((p) => p.id === 'friends')?.enabled;
  const clusters = friendsOn ? buildClusters(pool, bonds, maxSize) : pool.map((p) => [p.id]);

  const input = { pool, ratingOf, pairEffects };

  let best: Lineup | null = null;
  let bestCost = Infinity;

  for (let i = 0; i < restarts; i++) {
    const candidate = localSearch(
      greedyBuild(clusters, ratingOf, sizes),
      input,
      sizes,
      priorities,
    );
    const c = cost(candidate, input, sizes, priorities);
    if (c < bestCost) {
      bestCost = c;
      best = candidate;
    }
    if (bestCost < 1e-9) break; // חלוקה מושלמת — אין טעם להמשיך
  }

  return best ?? emptyLineup();
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
  for (const t of TEAM_IDS) for (const id of lineup[t]) teamOf.set(id, t);

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
  for (const t of TEAM_IDS) if (lineup[t].includes(playerId)) return t;
  return null;
}

/** מחליף בין שני שחקנים; אם הם באותה קבוצה — לא קורה כלום. */
export function swapPlayers(lineup: Lineup, aId: string, bId: string): Lineup {
  const ta = findTeamOf(lineup, aId);
  const tb = findTeamOf(lineup, bId);
  if (!ta || !tb || ta === tb) return lineup;

  const next: Lineup = {
    white: [...lineup.white],
    black: [...lineup.black],
    colored: [...lineup.colored],
  };
  next[ta][next[ta].indexOf(aId)] = bId;
  next[tb][next[tb].indexOf(bId)] = aId;
  return next;
}

/** מעביר שחקן לקבוצה אחרת (גדלי הקבוצות עשויים להשתנות). */
export function movePlayer(lineup: Lineup, playerId: string, to: TeamId): Lineup {
  const from = findTeamOf(lineup, playerId);
  if (!from || from === to) return lineup;

  const next: Lineup = {
    white: [...lineup.white],
    black: [...lineup.black],
    colored: [...lineup.colored],
  };
  next[from] = next[from].filter((id) => id !== playerId);
  next[to] = [...next[to], playerId];
  return next;
}

export const round1 = (n: number) => Math.round(n * 10) / 10;
export const fmtRating = (n: number) => n.toFixed(1);
export const fmtAvg = (n: number) => n.toFixed(2);
