/** מזהי שלוש הקבוצות הקבועות של המשחק השבועי. */
export type TeamId = 'white' | 'black' | 'colored';

export const TEAM_IDS: readonly TeamId[] = ['white', 'black', 'colored'] as const;

/** תוצאת המשחק: הקבוצה המנצחת, תיקו, או טרם עודכן. */
export type MatchResult = TeamId | 'draw';

/** שחקן במאגר הקבוע. */
export interface Player {
  id: string;
  name: string;
  /** דירוג בין 1.0 ל-5.0, בקפיצות של 0.1 */
  rating: number;
  /** "חבר של" — מזהה של שחקן אחר */
  friendOf?: string | null;
}

/** הרכב הכוחות: לכל קבוצה רשימת מזהי שחקנים. */
export type Lineup = Record<TeamId, string[]>;

/** תמונת מצב של שחקן ברגע השמירה (כדי שהיסטוריה לא תישבר אם שחקן נמחק). */
export interface HistoryPlayer {
  id: string;
  name: string;
  rating: number;
}

/** הגרלה שבועית שנשמרה. */
export interface MatchRecord {
  id: string;
  /** תאריך ISO של מועד השמירה */
  savedAt: string;
  /** תאריך המשחק בפורמט YYYY-MM-DD */
  date: string;
  title?: string;
  teams: Record<TeamId, HistoryPlayer[]>;
  /** מי ניצח — מתעדכן אחרי המשחק. undefined = טרם עודכן */
  result?: MatchResult;
  /** מי אישר הגעה ואז ביטל באותו שבוע */
  cancelled?: HistoryPlayer[];
  /** מי החליף את מי אחרי ביטול */
  substitutions?: { out: HistoryPlayer; in: HistoryPlayer }[];
}

export const TEAM_META: Record<
  TeamId,
  {
    name: string;
    emoji: string;
    /** מחלקות Tailwind לעיצוב כרטיס הקבוצה */
    ring: string;
    header: string;
    chip: string;
    dot: string;
    softBg: string;
  }
> = {
  white: {
    name: 'לבן',
    emoji: '⚪',
    ring: 'border-slate-300/40',
    header: 'bg-gradient-to-l from-slate-100/95 to-slate-300/90 text-slate-900',
    chip: 'bg-slate-200/15 text-slate-100 border-slate-200/30',
    dot: 'bg-slate-100',
    softBg: 'bg-slate-100/[0.04]',
  },
  black: {
    name: 'שחור',
    emoji: '⚫',
    ring: 'border-slate-600/50',
    header: 'bg-gradient-to-l from-slate-800 to-slate-950 text-slate-100',
    chip: 'bg-slate-700/30 text-slate-200 border-slate-600/40',
    dot: 'bg-slate-900 ring-1 ring-slate-500',
    softBg: 'bg-slate-950/40',
  },
  colored: {
    // שלושה פסים מלאים — כחול / צהוב / אדום, בלי מראה של קשת
    name: 'צבעוני',
    emoji: '🔵🟡🔴',
    ring: 'border-amber-400/50',
    header:
      'bg-[linear-gradient(90deg,#2563eb_0_33.34%,#facc15_33.34%_66.67%,#dc2626_66.67%_100%)] text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.55)]',
    chip: 'bg-amber-400/10 text-amber-100 border-amber-400/30',
    dot: 'bg-[linear-gradient(90deg,#2563eb_0_33.34%,#facc15_33.34%_66.67%,#dc2626_66.67%_100%)]',
    softBg: 'bg-amber-400/[0.04]',
  },
};

export const emptyLineup = (): Lineup => ({ white: [], black: [], colored: [] });
