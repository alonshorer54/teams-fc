import {
  isFillerId,
  recordPlacements,
  teamsIn,
  type MatchRecord,
  type Placements,
} from '../types';

/**
 * "כימיה משחקית" — נלמדת מהתוצאות, בניגוד לכימיה החברית שאתה מגדיר ידנית.
 *
 * הרעיון: לכל זוג ששיחק יחד באותה קבוצה, משווים את אחוז הניצחון *שלהם יחד*
 * לאחוז הניצחון הממוצע של כל אחד בנפרד. אם הם מנצחים יותר ממה שהיה צפוי —
 * יש ביניהם משהו. ההפרש הזה נקרא כאן "אפקט".
 *
 * רק ניצחון והפסד מלמדים משהו. ערב שקול (באמצע) אומר שהזוג גם ניצח וגם הפסד
 * באותו ערב, אז הוא לא דוחף את האפקט לשום כיוון — הוא נחשב כמו שהיה צפוי, נספר
 * כחצי ערב, ורק מדלל. זוג שרק מנצח או רק מפסיד יבלוט; זוג של שקולים יישאר באפס.
 */

/** מתחת לזה זה רעש ולא מגמה — לא מציגים בכלל. נמדד בערבים שנספרו (שקול = חצי) */
export const MIN_GAMES_TOGETHER = 3;

/** כמה ערב שקול שווה מול ערב שהוכרע, בספירת המדגם */
export const DRAW_WEIGHT = 0.5;

/** הפרש קטן מזה בין המצוי לצפוי הוא עיגול, לא כימיה */
export const EFFECT_THRESHOLD = 0.05;

export interface PairStat {
  aId: string;
  bId: string;
  aName: string;
  bName: string;
  /** משחקים עם תוצאה מעודכנת שבהם היו באותה קבוצה */
  games: number;
  /** הערבים שנספרו למדגם: ניצחון והפסד שלמים, שקול חצי */
  counted: number;
  wins: number;
  losses: number;
  draws: number;
  /** אחוז הניצחון, כשערב שקול נספר כחצי ערב שיצא בדיוק כצפוי */
  winRate: number;
  /** אחוז הניצחון שהיה צפוי לפי הביצועים האישיים שלהם */
  expected: number;
  /** winRate פחות expected — כמה הם מוסיפים אחד לשני */
  effect: number;
  confidence: 'low' | 'medium' | 'high';
}

/** זוג שעדיין לא עבר את סף המשחקים — מוצג כדי לומר כמה חסר לו */
export interface PairProgress {
  aName: string;
  bName: string;
  games: number;
  counted: number;
  wins: number;
  draws: number;
  /** כמה ערבים משותפים שהוכרעו חסרים עד שאפשר יהיה לקבוע עליו משהו */
  missing: number;
}

export interface PairReport {
  /** זוגות שמנצחים יותר מהצפוי */
  strong: PairStat[];
  /** זוגות שמנצחים פחות מהצפוי */
  weak: PairStat[];
  /** כמה משחקים עם תוצאה יש בסך הכל — קובע כמה אפשר לסמוך על זה */
  resolvedMatches: number;
  /** כמה הגרלות נשמרו בלי שעודכנה להן תוצאה — הן פשוט לא נספרות כאן */
  pendingMatches: number;
  /** כמה זוגות עברו את סף המשחקים המינימלי */
  qualifiedPairs: number;
  /** מתוכם — כמה מנצחים בדיוק כמו שצפוי, כלומר בלי אפקט לכאן או לכאן */
  neutralPairs: number;
  /** הזוגות הכי קרובים לסף, כשעוד אין אף אחד שעבר אותו */
  closest: PairProgress[];
}

const confidenceOf = (counted: number): PairStat['confidence'] =>
  counted >= 8 ? 'high' : counted >= 5 ? 'medium' : 'low';

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
  const resolved = history
    .map((record) => ({ record, placements: recordPlacements(record) }))
    .filter((r): r is { record: MatchRecord; placements: Placements } => !!r.placements);
  const pendingMatches = history.length - resolved.length;

  // ביצועים אישיים — הבסיס להשוואה
  const solo = new Map<string, { wins: number; losses: number; name: string }>();
  // תוצאות של זוגות
  const pairs = new Map<
    string,
    { a: string; b: string; games: number; wins: number; losses: number; draws: number }
  >();

  for (const { record, placements } of resolved) {
    const teams = teamsIn(record.teams);

    for (const team of teams) {
      // משלימים הם שחקני דמה של ערב אחד — זוג איתם לא מלמד כלום
      const members = (record.teams[team] ?? []).filter((p) => !isFillerId(p.id));
      const place = placements[team] ?? teams.length;
      const won = place <= 1;
      // "אמצע" — לא ניצחון ולא הפסד; עם 2 קבוצות אין מצב כזה
      const lost = !won && place >= teams.length;

      for (const p of members) {
        const entry = solo.get(p.id) ?? { wins: 0, losses: 0, name: p.name };
        entry.name = p.name;
        if (won) entry.wins++;
        if (lost) entry.losses++;
        solo.set(p.id, entry);
      }

      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
          const [a, b] = [members[i].id, members[j].id].sort();
          const key = `${a}|${b}`;
          const entry = pairs.get(key) ?? { a, b, games: 0, wins: 0, losses: 0, draws: 0 };
          entry.games++;
          if (won) entry.wins++;
          else if (lost) entry.losses++;
          else entry.draws++;
          pairs.set(key, entry);
        }
      }
    }
  }

  // גם הבסיס נמדד רק על ערבים שהוכרעו, כדי שהשוואה תהיה תפוח מול תפוח
  const decisiveRate = (wins: number, losses: number) =>
    wins + losses ? wins / (wins + losses) : 0.5;
  const soloRate = (id: string) => {
    const s = solo.get(id);
    return s ? decisiveRate(s.wins, s.losses) : 0.5;
  };

  const nameOf = (id: string) => solo.get(id)?.name ?? '';

  const stats: PairStat[] = [];
  /** מי שעוד לא הגיע לסף — שומרים כדי שנוכל לומר כמה חסר לו */
  const belowThreshold: PairProgress[] = [];

  for (const entry of pairs.values()) {
    const decisive = entry.wins + entry.losses;
    const counted = decisive + entry.draws * DRAW_WEIGHT;

    if (counted < MIN_GAMES_TOGETHER) {
      belowThreshold.push({
        aName: nameOf(entry.a),
        bName: nameOf(entry.b),
        games: entry.games,
        counted,
        wins: entry.wins,
        draws: entry.draws,
        missing: Math.ceil(MIN_GAMES_TOGETHER - counted),
      });
      continue;
    }

    const expected = (soloRate(entry.a) + soloRate(entry.b)) / 2;
    // ערב שקול נחשב כאילו יצא בדיוק כצפוי, אז הוא מדלל את האפקט ולא יוצר אותו
    const winRate = (entry.wins + entry.draws * DRAW_WEIGHT * expected) / counted;

    stats.push({
      aId: entry.a,
      bId: entry.b,
      aName: nameOf(entry.a),
      bName: nameOf(entry.b),
      games: entry.games,
      counted,
      wins: entry.wins,
      losses: entry.losses,
      draws: entry.draws,
      winRate,
      expected,
      effect: winRate - expected,
      confidence: confidenceOf(counted),
    });
  }

  const strong = stats.filter((s) => s.effect > EFFECT_THRESHOLD);
  const weak = stats.filter((s) => s.effect < -EFFECT_THRESHOLD);

  return {
    strong: strong.sort((a, b) => b.effect - a.effect || b.counted - a.counted).slice(0, 10),
    weak: weak.sort((a, b) => a.effect - b.effect || b.counted - a.counted).slice(0, 10),
    resolvedMatches: resolved.length,
    pendingMatches,
    qualifiedPairs: stats.length,
    neutralPairs: stats.length - strong.length - weak.length,
    // הכי קרובים לסף קודם, ובתוך אותו מספר ערבים — מי שהצליח יותר
    closest: belowThreshold
      .sort(
        (a, b) =>
          b.counted - a.counted ||
          b.wins - a.wins ||
          a.aName.localeCompare(b.aName, 'he'),
      )
      .slice(0, 6),
  };
}
