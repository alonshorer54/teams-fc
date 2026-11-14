import {
  ALL_TEAM_IDS,
  DEFAULT_TEAM_COUNT,
  MAX_TEAMS,
  MIN_TEAMS,
  cleanPositions,
  isPlayerPhoto,
  type DrawConstraint,
  type Filler,
  type HistoryPlayer,
  type Lineup,
  type MatchRecord,
  type Placements,
  type Player,
  type RatingChangeRecord,
  type TeamId,
} from '../types';
import {
  DEFAULT_PRIORITIES,
  PRIORITIES_VERSION,
  normalizePriorities,
  type CriterionSetting,
} from './criteria';

// המפתחות נשמרו בשמם המקורי כדי שנתונים קיימים אצל משתמשים לא יאבדו בשינוי השם
export const STORAGE_KEYS = {
  players: 'kohot.players.v1',
  history: 'kohot.history.v1',
  draft: 'kohot.draft.v1',
  settings: 'kohot.settings.v1',
  /** A local change that hasn't reached the cloud yet — see useSyncedStore */
  pending: 'kohot.pending.v1',
  /** Whose squad the local copy is, so it never gets uploaded into someone else's account */
  owner: 'kohot.owner.v1',
} as const;

/**
 * The squad data is the signed-in person's; what's left on the device after signing out is
 * someone else's to read, and was uploaded as the squad of the next new account to sign in.
 * Device preferences (team view, share layout) stay. Returns false, and keeps everything, when
 * a change still hasn't reached the cloud — clearing would lose it.
 */
export function clearLocalSquads(): boolean {
  try {
    const keys = Object.keys(localStorage);
    if (keys.some((k) => k === STORAGE_KEYS.pending || k.startsWith(`${STORAGE_KEYS.pending}@`))) {
      return false;
    }
    const squadKeys = [
      STORAGE_KEYS.players,
      STORAGE_KEYS.history,
      STORAGE_KEYS.draft,
      STORAGE_KEYS.settings,
      STORAGE_KEYS.owner,
      'kohot.squad.v1',
    ];
    for (const k of keys) {
      if (squadKeys.some((s) => k === s || k.startsWith(`${s}@`))) localStorage.removeItem(k);
    }
    return true;
  } catch {
    return true;
  }
}

/** גבייה שבועית — מתאפסת רק בכפתור "איפוס". */
export interface PaymentRound {
  /** תאריך המחזור שעליו הגבייה */
  matchDate: string;
  /** כמה כל אחד משלם */
  amount: number;
  /** מי כבר שילם, ואיך */
  paid: Record<string, { at: string; method: PaymentMethod }>;
  /**
   * מי צריך לשלם — מי ששיחק בהגרלה האחרונה שנשמרה. נשמר בנפרד מהמחזור, כי
   * המחזור מתנקה ברגע שמסמנים תוצאה, והגבייה נמשכת אחריו. ריק = אין הגרלה
   * שמורה, ואז הגבייה היא לפי מי שמשחק במחזור הנוכחי.
   *
   * חסר (ולא ריק) = הגבייה מלפני שהשדה נוסף. ההבדל נשמר בכוונה, ולכן אין לו
   * ברירת מחדל ב-normalizeSettings: כל כתיבה של הגדרות מנורמלות הייתה מוחקת אותו.
   */
  playerIds?: string[];
  /**
   * גביות של ערבים קודמים שעוד חייבים בהן, מהחדשה לישנה. יושבות בתוך הגבייה
   * הנוכחית ולא כשדה נפרד בהגדרות, כדי שגרסה ישנה שעוד רצה בטלפון של מישהו —
   * שבונה את ההגדרות מהשדות שהיא מכירה — לא תמחק אותן בשמירה הבאה שלה.
   */
  earlier?: PaymentRound[];
}

export type PaymentMethod = 'bitGroup' | 'bit' | 'paybox' | 'cash';

/** הסדר כאן הוא הסדר שמוצג במסך התשלומים */
export const PAYMENT_METHODS: Record<PaymentMethod, string> = {
  bitGroup: 'בקבוצה בביט',
  bit: 'בביט רגיל',
  paybox: 'בפייבוקס',
  cash: 'מזומן',
};

export const PAYMENT_METHOD_ORDER: PaymentMethod[] = ['bitGroup', 'bit', 'paybox', 'cash'];

export const emptyPayments = (matchDate: string): PaymentRound => ({
  matchDate,
  amount: 0,
  paid: {},
});

/** הגדרות שמסתנכרנות בין המכשירים יחד עם השחקנים וההיסטוריה. */
export interface AppSettings {
  priorities: CriterionSetting[];
  /** גרסת ברירות המחדל שלפיה נשמר `priorities` — ראו normalizePriorities */
  prioritiesVersion: number;
  /**
   * מאיזה רגע המד של תיקון הדירוגים סופר (ראו lib/ratingDrift.ts).
   * `DRIFT_FROM_START` = כל ההיסטוריה. כל ערך אחר הוא עוגן ישן מהתקופה שבה
   * רק תוצאות חדשות נספרו, ו-App מריץ עליו פעם אחת את כל ההיסטוריה מחדש.
   */
  ratingDriftSince: string;
  /** לפי איזו גרסת כללים חושב המד — ראו DRIFT_RULES_VERSION */
  ratingRulesVersion: number;
  payments: PaymentRound;
  /** המחזור הנוכחי — מסונכרן כדי שהטלפון והמחשב יראו את אותן קבוצות */
  round: Draft;
}

export const defaultSettings = (): AppSettings => ({
  priorities: DEFAULT_PRIORITIES,
  prioritiesVersion: PRIORITIES_VERSION,
  ratingDriftSince: '',
  ratingRulesVersion: 1,
  payments: emptyPayments(''),
  round: emptyDraft(''),
});

/** משלים שדות שנוספו אחרי שההגדרות כבר נשמרו בענן. */
export const normalizeSettings = (raw: Partial<AppSettings> | undefined): AppSettings => ({
  priorities: raw?.priorities ?? DEFAULT_PRIORITIES,
  // הגדרות שנשמרו לפני שהשדה קיים הן מלפני המיגרציה, כלומר גרסה 1
  prioritiesVersion: raw?.prioritiesVersion ?? (raw?.priorities ? 1 : PRIORITIES_VERSION),
  // ריק = עוד לא עוגן. App מריץ את כל ההיסטוריה פעם אחת ומעגן להתחלה
  ratingDriftSince: raw?.ratingDriftSince ?? '',
  ratingRulesVersion: raw?.ratingRulesVersion ?? 1,
  payments: raw?.payments ?? emptyPayments(''),
  round: normalizeDraft(raw?.round ?? {}, raw?.round?.matchDate ?? ''),
});

/** טיוטת העבודה הנוכחית — נשמרת כדי שרענון דף לא יאבד את ההגרלה. */
/** מי החליף את מי במחזור הנוכחי */
export interface Substitution {
  outId: string;
  inId: string;
}

export interface Draft {
  selectedIds: string[];
  lineup: Lineup | null;
  /** ההגרלה כפי שיצאה מהאלגוריתם, לפני עריכות ידניות — בסיס להשוואה */
  baseline: Lineup | null;
  matchDate: string;
  /** מי אישר הגעה ואז ביטל השבוע */
  cancelledIds: string[];
  substitutions: Substitution[];
  /** לכמה קבוצות מחלקים — 2 או 3. הגדלים נגזרים מכמות השחקנים. */
  teamCount: number;
  /** שחקני דמה שממלאים מקומות חסרים בהגרלה הזו בלבד */
  fillers: Filler[];
  /** "חייבים יחד / בנפרד" להגרלה הזו בלבד */
  constraints: DrawConstraint[];
}

export const emptyDraft = (matchDate: string): Draft => ({
  selectedIds: [],
  lineup: null,
  baseline: null,
  matchDate,
  cancelledIds: [],
  substitutions: [],
  teamCount: DEFAULT_TEAM_COUNT,
  fillers: [],
  constraints: [],
});

/** מגביל את מספר הקבוצות לטווח שהפלטה תומכת בו. */
export const clampTeamCount = (n: number): number =>
  Math.max(MIN_TEAMS, Math.min(MAX_TEAMS, Math.round(n) || DEFAULT_TEAM_COUNT));

/**
 * משלים שדות שנוספו בגרסאות מאוחרות, כדי שטיוטות ישנות לא יישברו.
 * בונה את האובייקט משדות מפורשים בלבד: שדות שבוטלו לא ממשיכים להיגרר
 * לענן בכל שמירה רק מפני שהם יושבים בטיוטה ישנה.
 */
export const normalizeDraft = (draft: Partial<Draft>, matchDate: string): Draft => ({
  selectedIds: draft.selectedIds ?? [],
  lineup: draft.lineup ?? null,
  baseline: draft.baseline ?? null,
  matchDate: draft.matchDate || matchDate,
  cancelledIds: draft.cancelledIds ?? [],
  substitutions: draft.substitutions ?? [],
  // טיוטות מלפני התכונה נשמרו בלי השדות האלה — ברירת המחדל היא ההתנהגות הישנה
  teamCount: clampTeamCount(draft.teamCount ?? DEFAULT_TEAM_COUNT),
  fillers: draft.fillers ?? [],
  constraints: draft.constraints ?? [],
});

export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error('שמירה ל-localStorage נכשלה', err);
  }
}

export interface BackupFile {
  version: number;
  exportedAt: string;
  players: Player[];
  history: MatchRecord[];
  /** From version 2: the money owed and the draw priorities. Older files have none. */
  settings?: Partial<Pick<AppSettings, 'payments' | 'priorities' | 'prioritiesVersion'>>;
}

/** מייצא את כל הנתונים לקובץ גיבוי חיצוני. */
export function exportAll(players: Player[], history: MatchRecord[], settings?: AppSettings): string {
  const backup: BackupFile = {
    version: 2,
    exportedAt: new Date().toISOString(),
    players,
    history,
    ...(settings && {
      settings: {
        payments: settings.payments,
        priorities: settings.priorities,
        prioritiesVersion: settings.prioritiesVersion,
      },
    }),
  };
  return JSON.stringify(backup, null, 2);
}

/** מוריד את הגיבוי כקובץ JSON. */
export function downloadBackup(players: Player[], history: MatchRecord[], settings?: AppSettings): void {
  const blob = new Blob([exportAll(players, history, settings)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kohot-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ---- Checking a backup file field by field ----
 * An imported file syncs to every device straight away. One malformed record (a team that
 * isn't a list, a rating that isn't a number) crashed the app on all of them, so anything
 * that isn't exactly the shape the app writes is dropped here. */

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter(isStr) : []);
const TEAM_KEYS: readonly string[] = ALL_TEAM_IDS;

function cleanPlayer(v: unknown): Player | null {
  if (!isObj(v) || !isStr(v.id) || !isStr(v.name) || !isNum(v.rating)) return null;
  return {
    id: v.id,
    name: v.name,
    rating: Math.min(5, Math.max(1, v.rating)),
    // Old backups kept a single friend, a single position, or "שוער" as a tag or a note;
    // they convert the same way normalizePlayers converts old data in storage
    friendIds: Array.isArray(v.friendIds) ? strings(v.friendIds) : isStr(v.friendOf) ? [v.friendOf] : [],
    loveIds: strings(v.loveIds),
    hateIds: strings(v.hateIds),
    positions: Array.isArray(v.positions)
      ? cleanPositions(v.positions)
      : isStr(v.position)
        ? cleanPositions([v.position])
        : [...strings(v.tags), isStr(v.notes) ? v.notes.trim() : ''].includes('שוער')
          ? ['gk']
          : ['any'],
    ...(v.isManager === true && { isManager: true }),
    ...(isPlayerPhoto(v.photo) && { photo: v.photo }),
  };
}

function cleanHistoryPlayer(v: unknown): HistoryPlayer | null {
  if (!isObj(v) || !isStr(v.id) || !isStr(v.name) || !isNum(v.rating)) return null;
  return { id: v.id, name: v.name, rating: v.rating };
}

const historyPlayers = (v: unknown): HistoryPlayer[] =>
  Array.isArray(v) ? v.map(cleanHistoryPlayer).filter((p): p is HistoryPlayer => !!p) : [];

function cleanChange(c: unknown): RatingChangeRecord | null {
  if (!isObj(c) || !isStr(c.playerId) || !isStr(c.name) || !isNum(c.from) || !isNum(c.to) || !isNum(c.gauge)) {
    return null;
  }
  return {
    playerId: c.playerId,
    name: c.name,
    from: c.from,
    to: c.to,
    gauge: c.gauge,
    recent: Array.isArray(c.recent) ? c.recent.filter(isNum) : [],
  };
}

function cleanRecord(v: unknown): MatchRecord | null {
  if (!isObj(v) || !isStr(v.id) || !isStr(v.date) || !isObj(v.teams)) return null;
  const teamsIn = v.teams;
  const teams: MatchRecord['teams'] = {};
  for (const t of TEAM_KEYS) if (t in teamsIn) teams[t as TeamId] = historyPlayers(teamsIn[t]);
  if (!Object.keys(teams).length) return null;

  const placements: Placements = {};
  if (isObj(v.placements)) {
    for (const t of TEAM_KEYS) {
      const place = v.placements[t];
      if (isNum(place)) placements[t as TeamId] = place;
    }
  }
  const changes =
    isObj(v.ratingCheck) && Array.isArray(v.ratingCheck.changes)
      ? v.ratingCheck.changes.map(cleanChange).filter((c): c is RatingChangeRecord => !!c)
      : null;
  const substitutions = Array.isArray(v.substitutions)
    ? v.substitutions.flatMap((s) => {
        const out = isObj(s) ? cleanHistoryPlayer(s.out) : null;
        const inn = isObj(s) ? cleanHistoryPlayer(s.in) : null;
        return out && inn ? [{ out, in: inn }] : [];
      })
    : [];
  const result =
    v.result === 'draw' || (isStr(v.result) && TEAM_KEYS.includes(v.result))
      ? (v.result as MatchRecord['result'])
      : undefined;

  return {
    id: v.id,
    date: v.date,
    savedAt: isStr(v.savedAt) ? v.savedAt : '',
    ...(isStr(v.title) && { title: v.title }),
    teams,
    ...(Object.keys(placements).length > 0 && { placements }),
    ...(result && { result }),
    cancelled: historyPlayers(v.cancelled),
    substitutions,
    ...(changes && { ratingCheck: { changes } }),
  };
}

function cleanPaymentRound(v: unknown, nested = false): PaymentRound | null {
  if (!isObj(v) || !isStr(v.matchDate)) return null;
  const paid: PaymentRound['paid'] = {};
  if (isObj(v.paid)) {
    for (const [id, mark] of Object.entries(v.paid)) {
      // Own keys only: `in` also accepts "constructor", and a "__proto__" id would replace
      // the map's prototype instead of adding an entry
      if (id === '__proto__') continue;
      if (
        isObj(mark) &&
        isStr(mark.at) &&
        isStr(mark.method) &&
        Object.prototype.hasOwnProperty.call(PAYMENT_METHODS, mark.method)
      ) {
        paid[id] = { at: mark.at, method: mark.method as PaymentMethod };
      }
    }
  }
  const earlier =
    !nested && Array.isArray(v.earlier)
      ? v.earlier.map((r) => cleanPaymentRound(r, true)).filter((r): r is PaymentRound => !!r)
      : [];
  return {
    matchDate: v.matchDate,
    amount: isNum(v.amount) && v.amount >= 0 ? v.amount : 0,
    paid,
    ...(Array.isArray(v.playerIds) && { playerIds: strings(v.playerIds) }),
    ...(earlier.length > 0 && { earlier }),
  };
}

/**
 * מפענח קובץ גיבוי ומוודא שהמבנה תקין.
 * זורק שגיאה עם הסבר בעברית אם הקובץ פגום.
 */
export function parseBackup(raw: string): BackupFile {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('הקובץ אינו קובץ JSON תקין');
  }

  if (!isObj(data)) throw new Error('מבנה הקובץ אינו מוכר');
  if (!Array.isArray(data.players)) throw new Error('לא נמצאה רשימת שחקנים בקובץ');

  const players = data.players.map(cleanPlayer).filter((p): p is Player => !!p);
  if (!players.length) throw new Error('לא נמצאו שחקנים תקינים בקובץ');

  const history = Array.isArray(data.history)
    ? data.history.map(cleanRecord).filter((r): r is MatchRecord => !!r)
    : [];

  const saved = isObj(data.settings) ? data.settings : {};
  const payments = cleanPaymentRound(saved.payments);
  const priorities = Array.isArray(saved.priorities)
    ? normalizePriorities(
        saved.priorities
          .filter((s) => isObj(s) && isStr(s.id) && typeof s.enabled === 'boolean')
          .map((s) => ({ id: s.id, enabled: s.enabled }) as CriterionSetting),
        isNum(saved.prioritiesVersion) ? saved.prioritiesVersion : 1,
      )
    : null;

  return {
    version: isNum(data.version) ? data.version : 1,
    exportedAt: isStr(data.exportedAt) ? data.exportedAt : '',
    players,
    history,
    settings: {
      ...(payments && { payments }),
      ...(priorities && { priorities, prioritiesVersion: PRIORITIES_VERSION }),
    },
  };
}
