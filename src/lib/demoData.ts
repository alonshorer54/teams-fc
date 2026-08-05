import { TEAM_IDS, type MatchRecord, type MatchResult, type Player, type TeamId } from '../types';

/**
 * 21 שחקני דוגמה (3 קבוצות של 7) לבדיקה מהירה של האפליקציה.
 * friendOfIndex מצביע על מיקום ברשימה — המזהים האמיתיים נוצרים בזמן הטעינה.
 */
export const DEMO_PLAYERS: { name: string; rating: number; friendOfIndex?: number }[] = [
  { name: 'איתי לוי', rating: 4.8 },
  { name: 'עומר כהן', rating: 4.6 },
  { name: 'דניאל מזרחי', rating: 4.5, friendOfIndex: 0 },
  { name: 'יונתן פרץ', rating: 4.3 },
  { name: 'רועי בן דוד', rating: 4.2 },
  { name: 'אלון שרון', rating: 4.0, friendOfIndex: 1 },
  { name: 'ניר אברהמי', rating: 3.9 },
  { name: 'שחר גולן', rating: 3.8 },
  { name: 'עידו ביטון', rating: 3.7, friendOfIndex: 3 },
  { name: 'טל אשכנזי', rating: 3.6 },
  { name: 'גיא מלכה', rating: 3.5 },
  { name: 'אורי דהן', rating: 3.4, friendOfIndex: 10 },
  { name: 'מתן שמש', rating: 3.3 },
  { name: 'ליאור אוחנה', rating: 3.2 },
  { name: 'עידן חדד', rating: 3.1, friendOfIndex: 13 },
  { name: 'נדב ברששת', rating: 3.0 },
  { name: 'יובל אלמוג', rating: 2.8 },
  { name: 'רן שטרן', rating: 2.7, friendOfIndex: 16 },
  { name: 'אסף נחום', rating: 2.5 },
  { name: 'עמית קדוש', rating: 2.3 },
  { name: 'בר יוספי', rating: 2.0, friendOfIndex: 19 },
];

/* ------------------------------------------------------------------ */
/*  היסטוריית דוגמה                                                    */
/* ------------------------------------------------------------------ */

const DEMO_WEEKS = 8;

/** אינדקסים ברשימה שלמעלה, לבניית סיפור שאפשר לראות בלשונית "מגמות" */
const VANISHED = 20; // בר יוספי — הפסיק להגיע לפני 4 שבועות
const FADING = 19; // עמית קדוש — היה קבוע ועכשיו בקושי מגיע
const FLAKY = 17; // רן שטרן — מבטל הרבה
const POWER_PAIR: [number, number] = [0, 2]; // איתי + דניאל — מנצחים יחד מעבר לצפוי

/** מחולל אקראי עם זרע קבוע, כדי שהדוגמה תיראה אותו דבר בכל טעינה */
function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const isoWeeksAgo = (weeks: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - weeks * 7);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/**
 * בונה 8 שבועות של היסטוריה מומצאת עבור שחקני הדוגמה.
 * הנתונים נועדו להראות את הלשוניות בפעולה: מישהו שנעלם, מישהו שמתפוגג,
 * מבטל סדרתי, וזוג שמנצח יחד יותר מהצפוי.
 */
export function buildDemoHistory(players: Player[]): MatchRecord[] {
  const rand = seededRandom(20260805);
  const records: MatchRecord[] = [];

  // weekAgo 0 = השבוע האחרון
  for (let weekAgo = 0; weekAgo < DEMO_WEEKS; weekAgo++) {
    const cancelled: Player[] = [];
    const available: Player[] = [];

    players.forEach((player, index) => {
      // בר יוספי שיחק רק בשבועות הישנים
      if (index === VANISHED && weekAgo < 4) return;
      // עמית קדוש: קבוע פעם, עכשיו מגיע רק פה ושם
      if (index === FADING && weekAgo < 4 && weekAgo !== 2) return;
      // רן שטרן מבטל מדי פעם
      if (index === FLAKY && (weekAgo === 1 || weekAgo === 4 || weekAgo === 6)) {
        cancelled.push(player);
        return;
      }
      available.push(player);
    });

    const teams = splitIntoTeams(available, rand);

    // הזוג משוחק יחד ברוב השבועות אבל לא בכולם — אחרת אי אפשר להפריד
    // את התרומה המשותפת שלהם מהביצועים האישיים, והאפקט יוצא אפס
    const united = weekAgo % 4 !== 3;
    const pairTeam = united ? teamHolding(teams, players, POWER_PAIR) : null;

    // כשהם יחד הקבוצה שלהם מנצחת לרוב; כשהם מופרדים התוצאה אקראית
    let result: MatchResult;
    if (pairTeam && rand() < 0.75) {
      result = pairTeam;
    } else {
      const roll = rand();
      result = roll < 0.3 ? 'white' : roll < 0.6 ? 'black' : roll < 0.9 ? 'colored' : 'draw';
    }

    records.push({
      id: `demo-week-${weekAgo}`,
      savedAt: new Date().toISOString(),
      date: isoWeeksAgo(weekAgo),
      result,
      teams: {
        white: teams.white.map(snapshot),
        black: teams.black.map(snapshot),
        colored: teams.colored.map(snapshot),
      },
      cancelled: cancelled.map(snapshot),
    });
  }

  return records; // כבר מהחדש לישן
}

const snapshot = ({ id, name, rating }: Player) => ({ id, name, rating });

/** מחלק את הנוכחים לשלוש קבוצות, ומקפיד להשאיר את זוג הכוח יחד */
function splitIntoTeams(available: Player[], rand: () => number): Record<TeamId, Player[]> {
  const shuffled = [...available];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const teams: Record<TeamId, Player[]> = { white: [], black: [], colored: [] };
  shuffled.forEach((player, index) => {
    teams[TEAM_IDS[index % 3]].push(player);
  });
  return teams;
}

/** מוצא את הקבוצה שבה נמצא זוג הכוח, ואם הם פוצלו — מאחד אותם אליה */
function teamHolding(
  teams: Record<TeamId, Player[]>,
  players: Player[],
  pair: [number, number],
): TeamId | null {
  const [aId, bId] = [players[pair[0]]?.id, players[pair[1]]?.id];
  if (!aId || !bId) return null;

  const teamOf = (id: string) => TEAM_IDS.find((t) => teams[t].some((p) => p.id === id)) ?? null;
  const teamA = teamOf(aId);
  const teamB = teamOf(bId);
  if (!teamA || !teamB) return null;
  if (teamA === teamB) return teamA;

  // מחליפים את השני עם מישהו מהקבוצה של הראשון, כדי שישחקו יחד
  const target = teams[teamA];
  const swapIndex = target.findIndex((p) => p.id !== aId);
  if (swapIndex === -1) return teamA;

  const moving = target[swapIndex];
  target[swapIndex] = players.find((p) => p.id === bId)!;
  teams[teamB] = teams[teamB].map((p) => (p.id === bId ? moving : p));
  return teamA;
}
