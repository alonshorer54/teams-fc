import { teamsIn, type MatchRecord, type Player } from '../types';

/** מה קרה לשחקן בשבוע מסוים */
export type WeekStatus = 'played' | 'cancelled' | 'absent';

/**
 * סיווג מצב הנוכחות. המטרה היא לא לספור הופעות אלא לזהות *שינוי* —
 * מי היה קבוע ופתאום הפסיק להגיע.
 */
export type AttendanceStatus = 'active' | 'slipping' | 'gone' | 'new' | 'never';

export interface PlayerAttendance {
  id: string;
  name: string;
  /** שבוע לכל הגרלה בהיסטוריה, מהחדש לישן */
  weeks: WeekStatus[];
  /** כמה שבועות עברו מאז ההופעה האחרונה (0 = שיחק בשבוע האחרון) */
  weeksSinceLast: number | null;
  playedCount: number;
  cancelledCount: number;
  totalWeeks: number;
  /** אחוז הופעות ב-4 השבועות האחרונים */
  recentRate: number;
  /** אחוז הופעות בכל מה שקדם להם */
  earlierRate: number;
  status: AttendanceStatus;
}

const RECENT_WINDOW = 4;
/** מ-3 שבועות רצופים בלי להופיע מתחילים לדבר על היעלמות */
const GONE_AFTER = 3;
/** ירידה של 40 נקודות אחוז בנוכחות היא כבר מגמה ולא מקריות */
const SLIP_DROP = 0.4;

export interface AttendanceReport {
  players: PlayerAttendance[];
  gone: PlayerAttendance[];
  slipping: PlayerAttendance[];
  /** תאריכי השבועות, מהחדש לישן — כותרות הטיימליין */
  weekDates: string[];
  /** מזהי ההגרלות — משמשים כמפתחות, כי שתי הגרלות יכולות ליפול באותו תאריך */
  weekIds: string[];
}

export function computeAttendance(players: Player[], history: MatchRecord[]): AttendanceReport {
  const weekDates = history.map((r) => r.date);
  const weekIds = history.map((r) => r.id);
  const total = history.length;

  const rows: PlayerAttendance[] = players.map((player) => {
    const weeks: WeekStatus[] = history.map((record) => {
      const played = teamsIn(record.teams).some((t) =>
        (record.teams[t] ?? []).some((p) => p.id === player.id),
      );
      if (played) return 'played';
      return (record.cancelled ?? []).some((p) => p.id === player.id) ? 'cancelled' : 'absent';
    });

    const playedCount = weeks.filter((w) => w === 'played').length;
    const cancelledCount = weeks.filter((w) => w === 'cancelled').length;

    const firstPlayed = weeks.indexOf('played'); // 0 = השבוע האחרון
    const weeksSinceLast = firstPlayed === -1 ? null : firstPlayed;

    const recentWeeks = weeks.slice(0, RECENT_WINDOW);
    const earlierWeeks = weeks.slice(RECENT_WINDOW);
    const rate = (list: WeekStatus[]) =>
      list.length ? list.filter((w) => w === 'played').length / list.length : 0;

    const recentRate = rate(recentWeeks);
    const earlierRate = rate(earlierWeeks);

    let status: AttendanceStatus;
    if (playedCount === 0) {
      status = 'never';
    } else if (weeksSinceLast !== null && weeksSinceLast >= GONE_AFTER) {
      status = 'gone';
    } else if (
      // היה קבוע יחסית וירד משמעותית — הסימן שביקשת לראות
      earlierWeeks.length >= 2 &&
      earlierRate >= 0.5 &&
      earlierRate - recentRate >= SLIP_DROP
    ) {
      status = 'slipping';
    } else if (playedCount <= 2 && weeks.slice(RECENT_WINDOW).every((w) => w !== 'played')) {
      status = 'new';
    } else {
      status = 'active';
    }

    return {
      id: player.id,
      name: player.name,
      weeks,
      weeksSinceLast,
      playedCount,
      cancelledCount,
      totalWeeks: total,
      recentRate,
      earlierRate,
      status,
    };
  });

  const byRecency = (a: PlayerAttendance, b: PlayerAttendance) =>
    (b.weeksSinceLast ?? 999) - (a.weeksSinceLast ?? 999);

  return {
    weekDates,
    weekIds,
    players: rows.sort(
      (a, b) => (a.weeksSinceLast ?? 999) - (b.weeksSinceLast ?? 999) || b.playedCount - a.playedCount,
    ),
    gone: rows.filter((r) => r.status === 'gone').sort(byRecency),
    slipping: rows
      .filter((r) => r.status === 'slipping')
      .sort((a, b) => b.earlierRate - b.recentRate - (a.earlierRate - a.recentRate)),
  };
}
