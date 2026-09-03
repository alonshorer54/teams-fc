/** מזהה קבוצה = הצבע שלה: לבן, שחור או צבעוני. */
export type TeamId = 'white' | 'black' | 'colored';

/**
 * שלושת הצבעים, בסדר קבוע — הסדר הזה קובע גם את סדר התצוגה.
 * בחלוקה לשתי קבוצות נלקחים שני הראשונים (לבן ושחור), ואפשר להחליף
 * כל אחד מהם לצבעוני דרך בורר הצבעים.
 */
export const ALL_TEAM_IDS: readonly TeamId[] = ['white', 'black', 'colored'] as const;

/** מחלקים לשתיים או לשלוש — לא יותר מזה */
export const MIN_TEAMS = 2;
export const MAX_TEAMS = 3;
export const TEAM_COUNT_OPTIONS: readonly number[] = [2, 3] as const;

/** ברירת המחדל ההיסטורית: לבן / שחור / צבעוני */
export const DEFAULT_TEAM_COUNT = 3;

/**
 * מפה שממופתחת בקבוצות. רק הקבוצות שמשתתפות בפועל מופיעות בה —
 * וזה מה שמאפשר לאותו מבנה לתאר גם 2 קבוצות וגם 8.
 */
export type TeamMap<T> = Partial<Record<TeamId, T>>;

/** הקבוצות שקיימות במפה, תמיד לפי סדר הפלטה. */
export const teamsIn = <T>(map: TeamMap<T>): TeamId[] =>
  ALL_TEAM_IDS.filter((t) => map[t] !== undefined);

/** הצבעים שישמשו הגרלה עם `count` קבוצות. */
export const defaultTeamIds = (count: number): TeamId[] =>
  ALL_TEAM_IDS.slice(0, Math.max(MIN_TEAMS, Math.min(MAX_TEAMS, count)));

/** @deprecated פורמט ישן — מנצחת יחידה או תיקו. מומר לדירוג מקומות בקריאה. */
export type MatchResult = TeamId | 'draw';

/** מקום בסיום הערב: 1 = הכי טובה, N = הכי פחות. שוויון מותר. */
export type Placement = number;
export type Placements = TeamMap<Placement>;

/**
 * נקודות לכל מקום — הבסיס לכל הסטטיסטיקות.
 * מקום ראשון = 1, אחרון = 0, והשאר פרוסים שווה ביניהם.
 * ב-3 קבוצות זה נותן בדיוק 1 / 0.5 / 0 כמו בגרסאות הקודמות.
 */
export const placementPoints = (place: Placement, teamCount: number): number =>
  teamCount > 1 ? (teamCount - place) / (teamCount - 1) : 1;

/** תיאור קריא של מקום. בשתי קבוצות אין "אמצע" — רק ראשונה ואחרונה. */
export function placementMeta(place: Placement, teamCount: number): {
  label: string;
  emoji: string;
} {
  if (place <= 1) return { label: 'ניצחה הרבה', emoji: '🥇' };
  if (place >= teamCount) return { label: 'הפסידה הרבה', emoji: '🥉' };
  return { label: 'באמצע', emoji: '🥈' };
}

/**
 * מחזיר את דירוג המקומות של הגרלה, כולל המרה מהפורמט הישן.
 * null = התוצאה עדיין לא עודכנה.
 */
export function recordPlacements(record: MatchRecord): Placements | null {
  if (record.placements) return record.placements;
  if (!record.result) return null;

  const teams = teamsIn(record.teams);
  // ישן: "לבן ניצחה" = לבן ראשונה, השאר אחרונות; תיקו = כולן באמצע
  if (record.result === 'draw') {
    const middle = Math.max(1, Math.ceil(teams.length / 2));
    return Object.fromEntries(teams.map((t) => [t, middle])) as Placements;
  }
  return Object.fromEntries(
    teams.map((t) => [t, t === record.result ? 1 : teams.length]),
  ) as Placements;
}

/* ------------------------------------------------------------------ */
/*  שחקנים                                                             */
/* ------------------------------------------------------------------ */

/** שחקן במאגר הקבוע. */
export interface Player {
  id: string;
  name: string;
  /** דירוג בין 1.0 ל-5.0, בקפיצות של 0.1 */
  rating: number;
  /** חברים — קשר דו-כיווני, בלי הגבלת מספר */
  friendIds: string[];
  /** מעדיף להיות איתם באותה קבוצה */
  loveIds: string[];
  /** מעדיף להיות בלעדיהם */
  hateIds: string[];
  /** מלל חופשי לגמרי: "לא בכושר", "רץ הרבה", "חוזר מפציעה" — מה שתרצו */
  tags: string[];
  /** מנהל הקבוצה — מי שסוגר את המגרש ואוסף את הכסף */
  isManager?: boolean;
  /** @deprecated שדה ישן מגרסה קודמת — מומר ל-friendIds בטעינה */
  friendOf?: string | null;
  /** @deprecated שדה ישן — ההערה הופכת לתגית בטעינה */
  notes?: string;
}

/* --------------------------- שחקן משלים --------------------------- */

/**
 * "משלים" — שחקן דמה שממלא מקום חסר בהגרלה אחת בלבד.
 *
 * הוא לא נכנס למאגר הקבוע ולא נספר בסטטיסטיקות: הוא נועד למקרה שבו הגיעו
 * 20 שחקנים ורוצים בכל זאת 3 קבוצות של 7. המזהה נושא קידומת קבועה, וזה מה
 * שמאפשר לכל שכבות הניתוח לזהות אותו ולדלג עליו.
 *
 * הערה: "משלים" ולא "מחליף" — מחליף הוא כבר מי שנכנס במקום שחקן שביטל
 * הגעה (ראו `substitutions`), ושימוש כפול במונח היה מבלבל בין שני דברים שונים.
 */
export const FILLER_PREFIX = 'filler:';

/** קידומת מגרסת פיתוח מוקדמת — נתמכת כדי שהגרלות שכבר נשמרו לא יישברו */
const LEGACY_FILLER_PREFIX = 'guest:';

export const isFillerId = (id: string): boolean =>
  id.startsWith(FILLER_PREFIX) || id.startsWith(LEGACY_FILLER_PREFIX);

export interface Filler {
  id: string;
  name: string;
  rating: number;
}

export const newFillerId = (): string =>
  `${FILLER_PREFIX}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** משלים בתחפושת שחקן, כדי שכל הלוגיקה הקיימת תעבוד עליו בלי תנאים מיוחדים. */
export const fillerAsPlayer = (filler: Filler): Player => ({
  id: filler.id,
  name: filler.name,
  rating: filler.rating,
  friendIds: [],
  loveIds: [],
  hateIds: [],
  tags: [],
});

/**
 * משלים שדות חסרים וממיר נתונים ישנים.
 * החברויות נהפכות לסימטריות: אם א' רשום כחבר של ב', גם ב' יקבל את א'.
 */
export function normalizePlayers(raw: Player[]): Player[] {
  const players = raw.map((p) => ({
    ...p,
    friendIds: [...new Set(p.friendIds ?? (p.friendOf ? [p.friendOf] : []))],
    loveIds: [...new Set(p.loveIds ?? [])],
    hateIds: [...new Set(p.hateIds ?? [])],
    // שדה ההערה בוטל לטובת תגיות חופשיות — ההערה הישנה נשמרת כתגית
    tags: [...new Set([...(p.tags ?? []), ...(p.notes?.trim() ? [p.notes.trim()] : [])])],
  }));

  const byId = new Map(players.map((p) => [p.id, p]));
  for (const p of players) {
    // מסירים הפניות לשחקנים שנמחקו, ואת השחקן מעצמו
    p.friendIds = p.friendIds.filter((id) => id !== p.id && byId.has(id));
    p.loveIds = p.loveIds.filter((id) => id !== p.id && byId.has(id));
    p.hateIds = p.hateIds.filter((id) => id !== p.id && byId.has(id));
  }
  for (const p of players) {
    for (const friendId of p.friendIds) {
      const friend = byId.get(friendId)!;
      if (!friend.friendIds.includes(p.id)) friend.friendIds.push(p.id);
    }
  }

  // חברות כבר אומרת "להשאיר יחד", אז אהבה על אותו אדם היא כפילות
  // ושנאה עליו היא סתירה. החברות גוברת.
  for (const p of players) {
    p.loveIds = p.loveIds.filter((id) => !p.friendIds.includes(id));
    p.hateIds = p.hateIds.filter((id) => !p.friendIds.includes(id));
  }

  for (const p of players) {
    delete p.friendOf;
    delete p.notes;
  }
  return players;
}

/** כל התגיות שקיימות במאגר, למילוי אוטומטי */
export const collectTags = (players: Player[]): string[] =>
  [...new Set(players.flatMap((p) => p.tags ?? []))].sort((a, b) => a.localeCompare(b, 'he'));

/* ------------------------------------------------------------------ */
/*  הרכב הקבוצות                                                        */
/* ------------------------------------------------------------------ */

/** הרכב הקבוצות: לכל קבוצה משתתפת רשימת מזהי שחקנים. */
export type Lineup = TeamMap<string[]>;

/** הקבוצות שמשתתפות בהרכב, לפי סדר הפלטה. */
export const lineupTeams = (lineup: Lineup): TeamId[] => teamsIn(lineup);

/** חברי קבוצה, גם אם היא לא קיימת בהרכב. */
export const membersOf = (lineup: Lineup, team: TeamId): string[] => lineup[team] ?? [];

/** כל השחקנים בהרכב, על פני כל הקבוצות. */
export const allInLineup = (lineup: Lineup): string[] =>
  lineupTeams(lineup).flatMap((t) => membersOf(lineup, t));

/** הרכב ריק עם הקבוצות שנבחרו. */
export const emptyLineup = (teamIds: readonly TeamId[] = defaultTeamIds(DEFAULT_TEAM_COUNT)): Lineup =>
  Object.fromEntries(teamIds.map((t) => [t, []])) as Lineup;

/** העתק עמוק של ההרכב, לעריכה בטוחה. */
export const cloneLineup = (lineup: Lineup): Lineup =>
  Object.fromEntries(lineupTeams(lineup).map((t) => [t, [...membersOf(lineup, t)]])) as Lineup;

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
  teams: TeamMap<HistoryPlayer[]>;
  /** דירוג הקבוצות בסיום הערב — מתעדכן אחרי המשחק */
  placements?: Placements;
  /** @deprecated פורמט ישן של תוצאה יחידה; נקרא דרך recordPlacements */
  result?: MatchResult;
  /** מי אישר הגעה ואז ביטל באותו שבוע */
  cancelled?: HistoryPlayer[];
  /** מי החליף את מי אחרי ביטול */
  substitutions?: { out: HistoryPlayer; in: HistoryPlayer }[];
}

/** ההרכב של הגרלה שנשמרה, כמזהי שחקנים — כדי להשוות אותה להגרלות חדשות. */
export const recordLineup = (record: MatchRecord): Lineup =>
  Object.fromEntries(
    teamsIn(record.teams).map((t) => [t, (record.teams[t] ?? []).map((p) => p.id)]),
  ) as Lineup;

/* ------------------------------------------------------------------ */
/*  עיצוב הקבוצות                                                      */
/* ------------------------------------------------------------------ */

export interface TeamMeta {
  name: string;
  emoji: string;
  /** מחלקות Tailwind לעיצוב כרטיס הקבוצה */
  ring: string;
  header: string;
  chip: string;
  dot: string;
  softBg: string;
  /** צבעי הכותרת בתמונת השיתוף. כמה ערכים = פסים. */
  hex: string[];
  /** צבע הטקסט מעל הכותרת בתמונה */
  hexText: string;
}

export const TEAM_META: Record<TeamId, TeamMeta> = {
  white: {
    name: 'לבן',
    emoji: '⚪',
    ring: 'border-slate-300/40',
    header: 'bg-gradient-to-l from-slate-100/95 to-slate-300/90 text-slate-900',
    chip: 'bg-slate-200/15 text-slate-100 border-slate-200/30',
    dot: 'bg-white ring-1 ring-slate-400/60',
    softBg: 'bg-slate-100/[0.04]',
    hex: ['#e2e8f0'],
    hexText: '#0f172a',
  },
  black: {
    name: 'שחור',
    emoji: '⚫',
    ring: 'border-slate-600/50',
    header: 'bg-gradient-to-l from-slate-800 to-slate-950 text-slate-100',
    chip: 'bg-slate-700/30 text-slate-200 border-slate-600/40',
    dot: 'bg-black ring-1 ring-slate-600',
    softBg: 'bg-slate-950/40',
    hex: ['#1e293b'],
    hexText: '#f1f5f9',
  },
  colored: {
    // שלושה פסים מלאים — כחול / צהוב / אדום, בלי מראה של קשת
    name: 'צבעוני',
    emoji: '🔵🟡🔴',
    ring: 'border-amber-400/50',
    header:
      'bg-[linear-gradient(90deg,#2563eb_0_33.34%,#facc15_33.34%_66.67%,#dc2626_66.67%_100%)] text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.55)]',
    chip: 'bg-amber-400/10 text-amber-100 border-amber-400/30',
    // עוגה בשלושה צבעים — נקראת כרב-צבעונית גם בגודל של כמה פיקסלים,
    // בניגוד לשלושה פסים אנכיים שמתמזגים לכתם אחד
    dot: 'bg-[conic-gradient(#2563eb_0_120deg,#facc15_0_240deg,#dc2626_0_360deg)] ring-1 ring-slate-500/60',
    softBg: 'bg-amber-400/[0.04]',
    hex: ['#2563eb', '#facc15', '#dc2626'],
    hexText: '#ffffff',
  },
};

/**
 * מחלקות פריסה לפי מספר הקבוצות: עמודה אחת בטלפון, ואז עמודה לכל קבוצה.
 * כל הקבוצות תמיד באותה שורה, כדי שהרוחבים יישארו זהים ומיושרים.
 *
 * המחלקות כתובות כמחרוזות מלאות בכוונה: Tailwind סורק את קוד המקור, ומחלקה
 * שנבנית בזמן ריצה (למשל `lg:grid-cols-${n}`) פשוט לא תיווצר.
 */
export const teamGridClass = (count: number): string =>
  `grid gap-4 ${count === 2 ? 'lg:grid-cols-2' : 'lg:grid-cols-3'}`;

/** אותה פריסה בגרסה צפופה — לכרטיסי ההיסטוריה ולפס האיזון. */
export const teamGridTight = (count: number): string =>
  `grid gap-3 ${count === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`;

/** פס האיזון: תא לכל קבוצה, תמיד בשורה אחת. */
export const teamStatsGridClass = (count: number): string =>
  `grid gap-2 ${count === 2 ? 'grid-cols-2' : 'grid-cols-3'}`;

/* ------------------------------------------------------------------ */
/*  שינוי הצבעים של הרכב קיים                                          */
/* ------------------------------------------------------------------ */

/**
 * מחליף את הצבעים של שתי קבוצות — כלומר מחליף ביניהן את רשימות השחקנים.
 * זו בדיוק המשמעות של "הקבוצה שהייתה לבנה משחקת עכשיו בשחור".
 */
export function swapTeamColors(lineup: Lineup, a: TeamId, b: TeamId): Lineup {
  if (a === b || !(a in lineup) || !(b in lineup)) return lineup;
  const next = cloneLineup(lineup);
  [next[a], next[b]] = [membersOf(lineup, b), membersOf(lineup, a)];
  return next;
}

/**
 * מעביר קבוצה לצבע שעדיין לא בשימוש.
 * אם היעד כבר תפוס, זו בקשה להחלפה בין השניים.
 */
export function recolorTeam(lineup: Lineup, from: TeamId, to: TeamId): Lineup {
  if (from === to || !(from in lineup)) return lineup;
  if (to in lineup) return swapTeamColors(lineup, from, to);

  const next: Lineup = {};
  // בונים מחדש כדי לא לשמור מפתח נטוש של הצבע הישן
  for (const t of lineupTeams(lineup)) {
    next[t === from ? to : t] = [...membersOf(lineup, t)];
  }
  return next;
}
