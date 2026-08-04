import type { Lineup, MatchRecord, Player } from '../types';
import type { ChemistryLevel } from './balance';

// המפתחות נשמרו בשמם המקורי כדי שנתונים קיימים אצל משתמשים לא יאבדו בשינוי השם
export const STORAGE_KEYS = {
  players: 'kohot.players.v1',
  history: 'kohot.history.v1',
  draft: 'kohot.draft.v1',
} as const;

/** טיוטת העבודה הנוכחית — נשמרת כדי שרענון דף לא יאבד את ההגרלה. */
export interface Draft {
  selectedIds: string[];
  lineup: Lineup | null;
  matchDate: string;
  /** מי אישר הגעה ואז ביטל השבוע */
  cancelledIds: string[];
  chemistry: ChemistryLevel;
}

export const emptyDraft = (matchDate: string): Draft => ({
  selectedIds: [],
  lineup: null,
  matchDate,
  cancelledIds: [],
  chemistry: 'light',
});

/** משלים שדות שנוספו בגרסאות מאוחרות, כדי שטיוטות ישנות לא יישברו. */
export const normalizeDraft = (draft: Partial<Draft>, matchDate: string): Draft => ({
  ...emptyDraft(matchDate),
  ...draft,
  cancelledIds: draft.cancelledIds ?? [],
  chemistry: draft.chemistry ?? 'light',
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
}

/** מייצא את כל הנתונים לקובץ גיבוי חיצוני. */
export function exportAll(players: Player[], history: MatchRecord[]): string {
  const backup: BackupFile = {
    version: 1,
    exportedAt: new Date().toISOString(),
    players,
    history,
  };
  return JSON.stringify(backup, null, 2);
}

/** מוריד את הגיבוי כקובץ JSON. */
export function downloadBackup(players: Player[], history: MatchRecord[]): void {
  const blob = new Blob([exportAll(players, history)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kohot-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
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

  if (!data || typeof data !== 'object') throw new Error('מבנה הקובץ אינו מוכר');
  const obj = data as Partial<BackupFile>;

  if (!Array.isArray(obj.players)) throw new Error('לא נמצאה רשימת שחקנים בקובץ');

  const players = obj.players.filter(
    (p): p is Player =>
      !!p && typeof p.id === 'string' && typeof p.name === 'string' && typeof p.rating === 'number',
  );
  if (!players.length) throw new Error('לא נמצאו שחקנים תקינים בקובץ');

  const history = Array.isArray(obj.history)
    ? obj.history.filter(
        (r): r is MatchRecord => !!r && typeof r.id === 'string' && !!r.teams && typeof r.date === 'string',
      )
    : [];

  return { version: obj.version ?? 1, exportedAt: obj.exportedAt ?? '', players, history };
}
