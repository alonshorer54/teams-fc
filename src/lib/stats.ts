import { TEAM_IDS, recordPlacements, type MatchRecord, type Placement, type TeamId } from '../types';

export interface CancellerStats {
  id: string;
  name: string;
  cancellations: number;
  /** בכמה מהשבועות שהוא הופיע ברשימה הוא ביטל */
  appearances: number;
  rate: number;
}

export interface PlayerRecord {
  id: string;
  name: string;
  /** משחקים עם תוצאה מעודכנת */
  played: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  /**
   * רצף נוכחי: חיובי = ניצחונות ברצף, שלילי = הפסדים ברצף, 0 = תיקו אחרון.
   * נספר מהמשחק האחרון אחורה.
   */
  streak: number;
  /** התוצאה במשחק האחרון שלו */
  last: 'win' | 'loss' | 'draw' | null;
  /** האם שיחק בשבוע האחרון שנשמר */
  playedLastWeek: boolean;
}

export interface HistoryStats {
  /** כמה הגרלות עדיין מחכות לעדכון תוצאה */
  pending: number;
  totalWithResult: number;
  players: PlayerRecord[];
  /** מי מפסיד 2+ שבועות ברצף — מועמדים לחיזוק בשבוע הבא */
  coldStreak: PlayerRecord[];
  /** מי מנצח 2+ שבועות ברצף */
  hotStreak: PlayerRecord[];
  cancellers: CancellerStats[];
  /** ההגרלה האחרונה עם תוצאה, לצורך "מי היה בקבוצה המנצחת" */
  lastResolved: { record: MatchRecord; winners: string[]; losers: string[] } | null;
}

const teamOfPlayer = (record: MatchRecord, playerId: string): TeamId | null => {
  for (const t of TEAM_IDS) if (record.teams[t].some((p) => p.id === playerId)) return t;
  return null;
};

/** מקום ראשון = ניצחון, שלישי = הפסד, שני = באמצע */
const outcomeOf = (place: Placement): 'win' | 'loss' | 'draw' =>
  place === 1 ? 'win' : place === 3 ? 'loss' : 'draw';

export function computeHistoryStats(history: MatchRecord[]): HistoryStats {
  // ההיסטוריה מגיעה מהחדש לישן; לחישוב רצפים זה בדיוק הסדר שאנחנו רוצים
  const players = new Map<string, PlayerRecord>();
  const cancelMap = new Map<string, CancellerStats>();
  /** האם הרצף של השחקן עדיין "פתוח" לספירה */
  const streakOpen = new Map<string, boolean>();

  let pending = 0;
  let lastResolved: HistoryStats['lastResolved'] = null;
  const lastWeekIds = new Set(
    history[0] ? TEAM_IDS.flatMap((t) => history[0].teams[t].map((p) => p.id)) : [],
  );

  for (const record of history) {
    const placements = recordPlacements(record);
    if (!placements) pending++;

    const listed = [...TEAM_IDS.flatMap((t) => record.teams[t]), ...(record.cancelled ?? [])];

    // ספירת ביטולים
    for (const p of listed) {
      const entry = cancelMap.get(p.id) ?? {
        id: p.id,
        name: p.name,
        cancellations: 0,
        appearances: 0,
        rate: 0,
      };
      entry.name = p.name;
      entry.appearances++;
      cancelMap.set(p.id, entry);
    }
    for (const p of record.cancelled ?? []) cancelMap.get(p.id)!.cancellations++;

    if (!placements) continue;

    if (!lastResolved) {
      const teamsAt = (place: Placement) => TEAM_IDS.filter((t) => placements[t] === place);
      lastResolved = {
        record,
        winners: teamsAt(1).flatMap((t) => record.teams[t].map((p) => p.id)),
        losers: teamsAt(3).flatMap((t) => record.teams[t].map((p) => p.id)),
      };
    }

    for (const t of TEAM_IDS) {
      for (const p of record.teams[t]) {
        const entry = players.get(p.id) ?? {
          id: p.id,
          name: p.name,
          played: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          winRate: 0,
          streak: 0,
          last: null,
          playedLastWeek: lastWeekIds.has(p.id),
        };
        entry.name = p.name;
        entry.played++;

        const team = teamOfPlayer(record, p.id) ?? t;
        const outcome = outcomeOf(placements[team]);

        if (outcome === 'win') entry.wins++;
        else if (outcome === 'loss') entry.losses++;
        else entry.draws++;

        if (entry.last === null) {
          entry.last = outcome;
          streakOpen.set(p.id, outcome !== 'draw');
          entry.streak = outcome === 'win' ? 1 : outcome === 'loss' ? -1 : 0;
        } else if (streakOpen.get(p.id)) {
          // ממשיכים לספור אחורה כל עוד התוצאה זהה לאחרונה
          if (outcome === 'win' && entry.streak > 0) entry.streak++;
          else if (outcome === 'loss' && entry.streak < 0) entry.streak--;
          else streakOpen.set(p.id, false);
        }

        players.set(p.id, entry);
      }
    }
  }

  const list = [...players.values()].map((p) => ({
    ...p,
    winRate: p.played ? p.wins / p.played : 0,
  }));

  return {
    pending,
    totalWithResult: history.length - pending,
    players: list.sort((a, b) => b.winRate - a.winRate || b.played - a.played),
    coldStreak: list
      .filter((p) => p.streak <= -2)
      .sort((a, b) => a.streak - b.streak || b.played - a.played),
    hotStreak: list
      .filter((p) => p.streak >= 2)
      .sort((a, b) => b.streak - a.streak || b.played - a.played),
    cancellers: [...cancelMap.values()]
      .filter((c) => c.cancellations > 0)
      .map((c) => ({ ...c, rate: c.appearances ? c.cancellations / c.appearances : 0 }))
      .sort((a, b) => b.cancellations - a.cancellations || b.rate - a.rate),
    lastResolved,
  };
}

/** מיפוי מהיר של רצפים, לשימוש במסך בחירת השחקנים. */
export function streakByPlayer(stats: HistoryStats): Map<string, number> {
  return new Map(stats.players.map((p) => [p.id, p.streak]));
}
