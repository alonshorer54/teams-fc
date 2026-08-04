import { TEAM_IDS, type MatchRecord, type TeamId } from '../types';

export interface TeamRecordStats {
  wins: number;
  played: number;
  winRate: number;
}

export interface CancellerStats {
  id: string;
  name: string;
  cancellations: number;
  /** בכמה מהשבועות שהוא הופיע ברשימה הוא ביטל */
  appearances: number;
  rate: number;
}

export interface HistoryStats {
  teams: Record<TeamId, TeamRecordStats>;
  draws: number;
  /** כמה הגרלות עדיין מחכות לעדכון תוצאה */
  pending: number;
  totalWithResult: number;
  /** הקבוצה עם הכי הרבה ניצחונות (null אם תיקו בפסגה או שאין נתונים) */
  leader: TeamId | null;
  cancellers: CancellerStats[];
  totalCancellations: number;
}

export function computeHistoryStats(history: MatchRecord[]): HistoryStats {
  const teams = {
    white: { wins: 0, played: 0, winRate: 0 },
    black: { wins: 0, played: 0, winRate: 0 },
    colored: { wins: 0, played: 0, winRate: 0 },
  } as Record<TeamId, TeamRecordStats>;

  let draws = 0;
  let pending = 0;

  const cancelMap = new Map<string, CancellerStats>();

  for (const record of history) {
    if (record.result) {
      for (const t of TEAM_IDS) teams[t].played++;
      if (record.result === 'draw') draws++;
      else teams[record.result].wins++;
    } else {
      pending++;
    }

    // כל מי שהופיע ברשימת השבוע — בין אם שיחק ובין אם ביטל
    const listed = [
      ...TEAM_IDS.flatMap((t) => record.teams[t]),
      ...(record.cancelled ?? []),
    ];
    for (const p of listed) {
      const entry = cancelMap.get(p.id) ?? {
        id: p.id,
        name: p.name,
        cancellations: 0,
        appearances: 0,
        rate: 0,
      };
      entry.name = p.name; // השם העדכני ביותר מנצח
      entry.appearances++;
      cancelMap.set(p.id, entry);
    }
    for (const p of record.cancelled ?? []) {
      const entry = cancelMap.get(p.id)!;
      entry.cancellations++;
    }
  }

  const totalWithResult = history.length - pending;
  for (const t of TEAM_IDS) {
    teams[t].winRate = teams[t].played ? teams[t].wins / teams[t].played : 0;
  }

  const ranked = [...TEAM_IDS].sort((a, b) => teams[b].wins - teams[a].wins);
  const leader =
    totalWithResult > 0 && teams[ranked[0]].wins > teams[ranked[1]].wins ? ranked[0] : null;

  const cancellers = [...cancelMap.values()]
    .filter((c) => c.cancellations > 0)
    .map((c) => ({ ...c, rate: c.appearances ? c.cancellations / c.appearances : 0 }))
    .sort((a, b) => b.cancellations - a.cancellations || b.rate - a.rate);

  return {
    teams,
    draws,
    pending,
    totalWithResult,
    leader,
    cancellers,
    totalCancellations: cancellers.reduce((s, c) => s + c.cancellations, 0),
  };
}
