import { TEAM_IDS, type MatchRecord } from '../types';

/**
 * "כימיה משחקית" — נלמדת מהתוצאות, בניגוד לכימיה החברית שאתה מגדיר ידנית.
 *
 * הרעיון: לכל זוג ששיחק יחד באותה קבוצה, משווים את אחוז הניצחון *שלהם יחד*
 * לאחוז הניצחון הממוצע של כל אחד בנפרד. אם הם מנצחים יותר ממה שהיה צפוי —
 * יש ביניהם משהו. ההפרש הזה נקרא כאן "אפקט".
 */

/** מתחת לזה זה רעש ולא מגמה — לא מציגים בכלל */
export const MIN_GAMES_TOGETHER = 3;

export interface PairStat {
  aId: string;
  bId: string;
  aName: string;
  bName: string;
  /** משחקים עם תוצאה מעודכנת שבהם היו באותה קבוצה */
  games: number;
  wins: number;
  draws: number;
  winRate: number;
  /** אחוז הניצחון שהיה צפוי לפי הביצועים האישיים שלהם */
  expected: number;
  /** winRate פחות expected — כמה הם מוסיפים אחד לשני */
  effect: number;
  confidence: 'low' | 'medium' | 'high';
}

export interface PairReport {
  /** זוגות שמנצחים יותר מהצפוי */
  strong: PairStat[];
  /** זוגות שמנצחים פחות מהצפוי */
  weak: PairStat[];
  /** כמה משחקים עם תוצאה יש בסך הכל — קובע כמה אפשר לסמוך על זה */
  resolvedMatches: number;
  /** כמה זוגות עברו את סף המשחקים המינימלי */
  qualifiedPairs: number;
}

const confidenceOf = (games: number): PairStat['confidence'] =>
  games >= 8 ? 'high' : games >= 5 ? 'medium' : 'low';

export const CONFIDENCE_LABEL: Record<PairStat['confidence'], string> = {
  low: 'מדגם קטן',
  medium: 'מדגם בינוני',
  high: 'מדגם טוב',
};

/**
 * מפה של אפקטים לשימוש באלגוריתם ההגרלה.
 * רק זוגות שעברו את סף המדגם ושהאפקט שלהם משמעותי מספיק נכללים.
 */
export function pairEffectMap(report: PairReport): Map<string, number> {
  const map = new Map<string, number>();
  for (const p of [...report.strong, ...report.weak]) {
    map.set([p.aId, p.bId].sort().join('|'), p.effect);
  }
  return map;
}

export function computePairChemistry(history: MatchRecord[]): PairReport {
  const resolved = history.filter((r) => r.result);

  // ביצועים אישיים — הבסיס להשוואה
  const solo = new Map<string, { games: number; points: number; name: string }>();
  // תוצאות של זוגות
  const pairs = new Map<string, { a: string; b: string; games: number; wins: number; draws: number }>();

  for (const record of resolved) {
    for (const team of TEAM_IDS) {
      const members = record.teams[team];
      const won = record.result === team;
      const drew = record.result === 'draw';

      for (const p of members) {
        const entry = solo.get(p.id) ?? { games: 0, points: 0, name: p.name };
        entry.name = p.name;
        entry.games++;
        // תיקו נספר כחצי ניצחון, כדי שהבסיס יהיה הוגן
        entry.points += won ? 1 : drew ? 0.5 : 0;
        solo.set(p.id, entry);
      }

      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
          const [a, b] = [members[i].id, members[j].id].sort();
          const key = `${a}|${b}`;
          const entry = pairs.get(key) ?? { a, b, games: 0, wins: 0, draws: 0 };
          entry.games++;
          if (won) entry.wins++;
          if (drew) entry.draws++;
          pairs.set(key, entry);
        }
      }
    }
  }

  const soloRate = (id: string) => {
    const s = solo.get(id);
    return s && s.games ? s.points / s.games : 0;
  };

  const stats: PairStat[] = [];
  for (const entry of pairs.values()) {
    if (entry.games < MIN_GAMES_TOGETHER) continue;

    const winRate = (entry.wins + entry.draws * 0.5) / entry.games;
    const expected = (soloRate(entry.a) + soloRate(entry.b)) / 2;

    stats.push({
      aId: entry.a,
      bId: entry.b,
      aName: solo.get(entry.a)?.name ?? '',
      bName: solo.get(entry.b)?.name ?? '',
      games: entry.games,
      wins: entry.wins,
      draws: entry.draws,
      winRate,
      expected,
      effect: winRate - expected,
      confidence: confidenceOf(entry.games),
    });
  }

  return {
    strong: stats
      .filter((s) => s.effect > 0.05)
      .sort((a, b) => b.effect - a.effect || b.games - a.games)
      .slice(0, 10),
    weak: stats
      .filter((s) => s.effect < -0.05)
      .sort((a, b) => a.effect - b.effect || b.games - a.games)
      .slice(0, 10),
    resolvedMatches: resolved.length,
    qualifiedPairs: stats.length,
  };
}
