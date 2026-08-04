import { TEAM_IDS, emptyLineup, type Lineup, type Player, type TeamId } from '../types';

/**
 * משקלי פונקציית העלות.
 * איזון הדירוגים דומיננטי; הכימיה משמשת בעיקר כ"שובר שוויון" בין חלוקות
 * שהן שוות-ערך כמעט מבחינת ממוצעים — בדיוק כפי שהוגדר בדרישות.
 */
const W_SPREAD = 20; // פער בין הממוצע הגבוה לנמוך
const W_VARIANCE = 6; // שונות הממוצעים (מונע קבוצה אחת "חריגה")
const W_BROKEN_PAIR = 0.15; // קנס בסיס על זוג חברים שפוצל (מוכפל בעוצמת הכימיה)
const W_SIZE = 4; // קנס על סטייה מגודל קבוצה יעד

/**
 * עוצמת הכימיה שהמשתמש בוחר.
 * גם ב"חזק" הדירוג עדיין מוביל — הכימיה רק מרשה לעצמה סטייה גדולה יותר בממוצעים.
 */
export type ChemistryLevel = 'off' | 'light' | 'strong';

export const CHEMISTRY_FACTOR: Record<ChemistryLevel, number> = {
  off: 0,
  light: 1,
  strong: 4,
};

export const CHEMISTRY_LABEL: Record<ChemistryLevel, string> = {
  off: 'דירוג בלבד',
  light: 'כימיה קלה',
  strong: 'כימיה חזקה',
};

/** כמה נקודות פער-ממוצע שווה שמירת זוג חברים יחד — כדי להסביר למשתמש את המחיר. */
export const chemistryPriceInRating = (level: ChemistryLevel) =>
  (W_BROKEN_PAIR * CHEMISTRY_FACTOR[level]) / W_SPREAD;

export interface TeamStats {
  count: number;
  total: number;
  avg: number;
  /** מספר קשרי חברות שנשמרו בתוך הקבוצה */
  bondsKept: number;
}

export interface LineupStats {
  teams: Record<TeamId, TeamStats>;
  /** הפרש בין הממוצע הגבוה לממוצע הנמוך */
  spread: number;
  bondsKept: number;
  bondsBroken: number;
  totalBonds: number;
}

/** זוג חברים (קשר דו-כיווני), ממוין לפי מזהה כדי למנוע כפילויות. */
export type Bond = readonly [string, string];

/** מחלץ את כל קשרי החברות בין שחקנים שנמצאים בבריכת הנבחרים. */
export function extractBonds(pool: Player[]): Bond[] {
  const ids = new Set(pool.map((p) => p.id));
  const seen = new Set<string>();
  const bonds: Bond[] = [];

  for (const p of pool) {
    const friend = p.friendOf;
    if (!friend || friend === p.id || !ids.has(friend)) continue;
    const key = [p.id, friend].sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    bonds.push([p.id, friend] as const);
  }
  return bonds;
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

export function computeStats(lineup: Lineup, pool: Player[]): LineupStats {
  const byId = new Map(pool.map((p) => [p.id, p]));
  const bonds = extractBonds(pool);
  const teamOf = new Map<string, TeamId>();
  for (const t of TEAM_IDS) for (const id of lineup[t]) teamOf.set(id, t);

  const teams = {} as Record<TeamId, TeamStats>;
  for (const t of TEAM_IDS) {
    const members = lineup[t];
    const total = members.reduce((s, id) => s + (byId.get(id)?.rating ?? 0), 0);
    teams[t] = {
      count: members.length,
      total: round1(total),
      avg: members.length ? total / members.length : 0,
      bondsKept: 0,
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

  const avgs = TEAM_IDS.filter((t) => teams[t].count > 0).map((t) => teams[t].avg);
  const spread = avgs.length ? Math.max(...avgs) - Math.min(...avgs) : 0;

  return {
    teams,
    spread,
    bondsKept,
    bondsBroken: bonds.length - bondsKept,
    totalBonds: bonds.length,
  };
}

/** בודק אם החבר/מזמין של שחקן נמצא באותה קבוצה. */
export function bondStatus(
  playerId: string,
  lineup: Lineup,
  pool: Player[],
): { hasBond: boolean; together: boolean; partnerNames: string[] } {
  const byId = new Map(pool.map((p) => [p.id, p]));
  const teamOf = new Map<string, TeamId>();
  for (const t of TEAM_IDS) for (const id of lineup[t]) teamOf.set(id, t);

  const partners = new Set<string>();
  const me = byId.get(playerId);
  if (me?.friendOf && byId.has(me.friendOf)) partners.add(me.friendOf);
  for (const p of pool) if (p.friendOf === playerId) partners.add(p.id);

  const list = [...partners];
  if (!list.length) return { hasBond: false, together: false, partnerNames: [] };

  const myTeam = teamOf.get(playerId);
  const together = list.some((id) => teamOf.get(id) === myTeam);
  return {
    hasBond: true,
    together,
    partnerNames: list.map((id) => byId.get(id)?.name ?? '').filter(Boolean),
  };
}

/* ------------------------------------------------------------------ */
/*  פונקציית העלות                                                     */
/* ------------------------------------------------------------------ */

function cost(
  lineup: Lineup,
  ratingOf: Map<string, number>,
  bonds: Bond[],
  sizes: Record<TeamId, number>,
  chemistry: number,
): number {
  const avgs: number[] = [];
  let sizePenalty = 0;

  for (const t of TEAM_IDS) {
    const members = lineup[t];
    if (members.length) {
      let sum = 0;
      for (const id of members) sum += ratingOf.get(id) ?? 0;
      avgs.push(sum / members.length);
    }
    sizePenalty += Math.abs(members.length - sizes[t]);
  }

  if (!avgs.length) return 0;

  const spread = Math.max(...avgs) - Math.min(...avgs);
  const mean = avgs.reduce((s, v) => s + v, 0) / avgs.length;
  const variance = avgs.reduce((s, v) => s + (v - mean) ** 2, 0) / avgs.length;

  const teamOf = new Map<string, TeamId>();
  for (const t of TEAM_IDS) for (const id of lineup[t]) teamOf.set(id, t);
  let broken = 0;
  for (const [a, b] of bonds) if (teamOf.get(a) !== teamOf.get(b)) broken++;

  return (
    spread * W_SPREAD +
    variance * W_VARIANCE +
    broken * W_BROKEN_PAIR * chemistry +
    sizePenalty * W_SIZE
  );
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

    // מדרגים לפי "ממוצע צפוי אחרי השיבוץ" — הקבוצה החלשה ביותר מקבלת קודם
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
  ratingOf: Map<string, number>,
  bonds: Bond[],
  sizes: Record<TeamId, number>,
  chemistry: number,
): Lineup {
  const current: Lineup = { white: [...lineup.white], black: [...lineup.black], colored: [...lineup.colored] };
  let best = cost(current, ratingOf, bonds, sizes, chemistry);

  for (let pass = 0; pass < 40; pass++) {
    let improved = false;

    for (let i = 0; i < TEAM_IDS.length; i++) {
      for (let j = i + 1; j < TEAM_IDS.length; j++) {
        const ta = TEAM_IDS[i];
        const tb = TEAM_IDS[j];

        for (let a = 0; a < current[ta].length; a++) {
          for (let b = 0; b < current[tb].length; b++) {
            [current[ta][a], current[tb][b]] = [current[tb][b], current[ta][a]];
            const next = cost(current, ratingOf, bonds, sizes, chemistry);
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
  /** כמה משקל לתת לשמירת חברים יחד */
  chemistry?: ChemistryLevel;
}

export function generateLineup(pool: Player[], options: GenerateOptions = {}): Lineup {
  const restarts = options.restarts ?? 60;
  const chemistry = CHEMISTRY_FACTOR[options.chemistry ?? 'light'];
  if (pool.length === 0) return emptyLineup();

  const ratingOf = new Map(pool.map((p) => [p.id, p.rating]));
  const bonds = extractBonds(pool);
  const sizes = teamSizes(pool.length);
  const maxSize = Math.max(sizes.white, sizes.black, sizes.colored);
  // כשהכימיה כבויה אין טעם לשמור אשכולות — כל שחקן עומד בפני עצמו
  const clusters = chemistry
    ? buildClusters(pool, bonds, maxSize)
    : pool.map((p) => [p.id]);

  let best: Lineup | null = null;
  let bestCost = Infinity;

  for (let i = 0; i < restarts; i++) {
    const candidate = localSearch(
      greedyBuild(clusters, ratingOf, sizes),
      ratingOf,
      bonds,
      sizes,
      chemistry,
    );
    const c = cost(candidate, ratingOf, bonds, sizes, chemistry);
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
}

/** רשימה קריאה של כל זוגות החברים ומצבם — "יוסי חבר של דני, יחד/מופרדים". */
export function describeBonds(lineup: Lineup, pool: Player[]): BondView[] {
  const byId = new Map(pool.map((p) => [p.id, p]));
  const teamOf = new Map<string, TeamId>();
  for (const t of TEAM_IDS) for (const id of lineup[t]) teamOf.set(id, t);

  return extractBonds(pool)
    .map(([a, b]) => {
      const ta = teamOf.get(a) ?? null;
      const tb = teamOf.get(b) ?? null;
      const together = !!ta && ta === tb;
      return {
        aId: a,
        bId: b,
        aName: byId.get(a)?.name ?? '',
        bName: byId.get(b)?.name ?? '',
        together,
        team: together ? ta : null,
      };
    })
    .sort((x, y) => Number(x.together) - Number(y.together) || x.aName.localeCompare(y.aName, 'he'));
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

  const next: Lineup = { white: [...lineup.white], black: [...lineup.black], colored: [...lineup.colored] };
  next[ta][next[ta].indexOf(aId)] = bId;
  next[tb][next[tb].indexOf(bId)] = aId;
  return next;
}

/** מעביר שחקן לקבוצה אחרת (גדלי הקבוצות עשויים להשתנות). */
export function movePlayer(lineup: Lineup, playerId: string, to: TeamId): Lineup {
  const from = findTeamOf(lineup, playerId);
  if (!from || from === to) return lineup;

  const next: Lineup = { white: [...lineup.white], black: [...lineup.black], colored: [...lineup.colored] };
  next[from] = next[from].filter((id) => id !== playerId);
  next[to] = [...next[to], playerId];
  return next;
}

export const round1 = (n: number) => Math.round(n * 10) / 10;
export const fmtRating = (n: number) => n.toFixed(1);
export const fmtAvg = (n: number) => n.toFixed(2);
