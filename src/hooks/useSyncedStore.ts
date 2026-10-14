import { useCallback, useEffect, useRef, useState } from 'react';
import type { MatchRecord, Player } from '../types';
import {
  STORAGE_KEYS,
  defaultSettings,
  normalizeSettings,
  type AppSettings,
} from '../lib/storage';
import { TABLE, isCloudConfigured, supabase } from '../lib/supabase';
import { useLocalStorage } from './useLocalStorage';

export type SyncStatus = 'local' | 'loading' | 'synced' | 'saving' | 'error';

const SAVE_DEBOUNCE_MS = 900;

/** קוד השגיאה ש-PostgREST מחזיר כשעמודה לא קיימת בסכמה */
const MISSING_COLUMN = 'PGRST204';

const fingerprint = (players: Player[], history: MatchRecord[], settings: AppSettings) =>
  JSON.stringify({ players, history, settings });

/**
 * מחזיק את השחקנים, ההיסטוריה וההגדרות, ומסנכרן אותם בין localStorage לענן.
 *
 * - ללא חשבון (או ללא הגדרות ענן) — עובד מקומית בלבד.
 * - עם חשבון — טוען מהענן בכניסה, שומר אוטומטית בכל שינוי,
 *   ומאזין לשינויים ממכשירים אחרים בזמן אמת.
 *
 * עמודת `settings` נוספה אחרי שהטבלה כבר הייתה בשימוש. אם היא חסרה,
 * ההגדרות פשוט נשארות מקומיות והאפליקציה ממשיכה לעבוד כרגיל.
 */
export function useSyncedStore(userId: string | null, isOwner = true) {
  // Someone else's squad (as a helper) gets its own local cache, so it never mixes with
  // the helper's own squad under the original keys. The component remounts per squad.
  const keys = isOwner || !userId ? STORAGE_KEYS : helperKeys(userId);
  const [players, setPlayers] = useLocalStorage<Player[]>(keys.players, []);
  const [history, setHistory] = useLocalStorage<MatchRecord[]>(keys.history, []);
  const [settings, setSettings] = useLocalStorage<AppSettings>(keys.settings, defaultSettings());

  const [status, setStatus] = useState<SyncStatus>(isCloudConfigured ? 'loading' : 'local');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** האם עמודת ההגדרות קיימת בענן */
  const [settingsSynced, setSettingsSynced] = useState(true);

  /** טביעת האצבע של המידע שכבר נמצא בענן — מונע כתיבות מיותרות ולולאות הד. */
  const cloudFingerprint = useRef<string | null>(null);
  const hydrated = useRef(false);
  const saveTimer = useRef<number | undefined>(undefined);
  const supportsSettings = useRef(true);
  /**
   * The row's updated_at as this device last saw it. A save only goes through if the row
   * still carries it — otherwise someone else (the owner or a helper) saved in between, and
   * writing the whole document now would silently wipe their change.
   */
  const cloudUpdatedAt = useRef<string | null>(null);
  /** שמירה מקומית ממתינה או בדרך — שינוי מקומי שעוד לא הגיע לענן */
  const savePending = useRef(false);

  /** Replaces local state with what the database holds, after a refused or conflicting save. */
  const adoptCloud = useCallback(async (): Promise<boolean> => {
    const client = supabase;
    if (!client || !userId) return false;
    const { data } = await client.from(TABLE).select('*').eq('user_id', userId).maybeSingle();
    if (!data) return false;
    const cloudSettings = normalizeSettings((data.settings ?? {}) as Partial<AppSettings>);
    cloudFingerprint.current = fingerprint(data.players ?? [], data.history ?? [], cloudSettings);
    cloudUpdatedAt.current = data.updated_at ?? null;
    setPlayers((data.players ?? []) as Player[]);
    setHistory((data.history ?? []) as MatchRecord[]);
    setSettings(cloudSettings);
    return true;
  }, [userId, setPlayers, setHistory, setSettings]);

  /* ------------------------- טעינה ראשונית מהענן ------------------------- */

  useEffect(() => {
    const client = supabase;
    if (!client || !userId) {
      hydrated.current = false;
      cloudFingerprint.current = null;
      setStatus(isCloudConfigured ? 'loading' : 'local');
      return;
    }

    let cancelled = false;
    setStatus('loading');
    setError(null);

    (async () => {
      // בודקים קודם אם עמודת ההגדרות בכלל קיימת. בלי הבדיקה הזו כתיבה עם
      // עמודה לא מוכרת הייתה נכשלת ומפילה את הסנכרון של השחקנים וההיסטוריה.
      const probe = await client.from(TABLE).select('settings').limit(1);
      const hasSettingsColumn = !probe.error;
      supportsSettings.current = hasSettingsColumn;
      if (!cancelled) setSettingsSynced(hasSettingsColumn);

      const { data, error: fetchError } = await client
        .from(TABLE)
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (cancelled) return;

      if (fetchError) {
        setError(fetchError.message);
        setStatus('error');
        return;
      }

      if (data) {
        const cloudPlayers = (data.players ?? []) as Player[];
        const cloudHistory = (data.history ?? []) as MatchRecord[];
        const cloudSettings: AppSettings =
          hasSettingsColumn && data.settings
            ? normalizeSettings(data.settings as Partial<AppSettings>)
            : settings;

        setPlayers(cloudPlayers);
        setHistory(cloudHistory);
        if (hasSettingsColumn && data.settings) setSettings(cloudSettings);

        cloudFingerprint.current = fingerprint(cloudPlayers, cloudHistory, cloudSettings);
        cloudUpdatedAt.current = data.updated_at ?? null;
        setLastSyncedAt(data.updated_at ?? new Date().toISOString());
      } else if (!isOwner) {
        // A helper never creates a squad; a missing row means access was removed
        setError('אין גישה לקבוצה הזו');
        setStatus('error');
        return;
      } else {
        // התחברות ראשונה — מעלים את מה שכבר קיים במכשיר
        const ok = await upsertRow(client, userId, players, history, settings, supportsSettings, isOwner, null);
        if (cancelled) return;
        if (!ok.success) {
          setError(ok.message ?? 'שמירה ראשונית נכשלה');
          setStatus('error');
          return;
        }
        cloudFingerprint.current = fingerprint(players, history, settings);
        cloudUpdatedAt.current = ok.updatedAt;
        setLastSyncedAt(new Date().toISOString());
      }

      hydrated.current = true;
      setStatus('synced');
    })();

    return () => {
      cancelled = true;
    };
    // טעינה חד-פעמית לכל משתמש; הנתונים המקומיים נקראים כאן בכוונה כערך התחלתי
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  /* --------------------------- שמירה אוטומטית --------------------------- */

  useEffect(() => {
    const client = supabase;
    if (!client || !userId || !hydrated.current) return;

    const current = fingerprint(players, history, settings);
    if (current === cloudFingerprint.current) return; // אין שינוי אמיתי

    setStatus('saving');
    savePending.current = true;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      const result = await upsertRow(
        client,
        userId,
        players,
        history,
        settings,
        supportsSettings,
        isOwner,
        cloudUpdatedAt.current,
      );
      savePending.current = false;
      if (!result.success) {
        setError(result.message ?? 'השמירה נכשלה');
        setStatus('error');
        // A conflicting or refused change would otherwise be retried with every later edit;
        // take what the database holds, so the next edit starts from the real squad
        if ((result.conflict || !isOwner) && !(await adoptCloud())) setError('אין גישה לקבוצה הזו');
        return;
      }
      setSettingsSynced(supportsSettings.current);
      cloudFingerprint.current = current;
      cloudUpdatedAt.current = result.updatedAt;
      setLastSyncedAt(result.updatedAt);
      setError(null);
      setStatus('synced');
    }, SAVE_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(saveTimer.current);
      // שינוי שבוטל לפני שנשלח לא ישאיר את הדגל דלוק לתמיד; שינוי חדש ידליק אותו שוב
      savePending.current = false;
    };
  }, [players, history, settings, userId, isOwner, adoptCloud]);

  /* ------------------- האזנה לשינויים ממכשירים אחרים ------------------- */

  useEffect(() => {
    const client = supabase;
    if (!client || !userId) return;

    const channel = client
      .channel(`kohot-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLE, filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as {
            players?: Player[];
            history?: MatchRecord[];
            settings?: AppSettings;
            updated_at?: string;
          };
          if (!row) return;
          if (!row.players) {
            // מעל 1MB ה-Realtime שולח את השורה בלי העמודות הגדולות. במקום לפספס את
            // השינוי בשקט — מביאים את השורה עצמה (אלא אם זה ההד של השמירה שלנו)
            // שמירה מקומית ממתינה תיתקל בהתנגשות ותאמץ את הענן בעצמה — כאן היא רק הייתה נמחקת
            if (
              row.updated_at &&
              row.updated_at !== cloudUpdatedAt.current &&
              !savePending.current
            ) {
              void adoptCloud().then((ok) => {
                if (!ok) return;
                setLastSyncedAt(row.updated_at ?? new Date().toISOString());
                setStatus('synced');
              });
            }
            return;
          }
          cloudUpdatedAt.current = row.updated_at ?? cloudUpdatedAt.current;

          const nextSettings: AppSettings = row.settings
            ? normalizeSettings(row.settings)
            : settings;
          const incoming = fingerprint(row.players, row.history ?? [], nextSettings);
          if (incoming === cloudFingerprint.current) return; // ההד של השמירה שלנו

          cloudFingerprint.current = incoming;
          setPlayers(row.players);
          setHistory(row.history ?? []);
          if (row.settings) setSettings(nextSettings);
          setLastSyncedAt(row.updated_at ?? new Date().toISOString());
          setStatus('synced');
        },
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
    // settings מכוון להישאר מחוץ לתלויות — הוא נקרא רק כברירת מחדל בתוך ה-callback
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, setPlayers, setHistory, setSettings, adoptCloud]);

  /** דחיפה מיידית לענן — לשימוש אחרי ייבוא גיבוי. */
  const flush = useCallback(
    async (nextPlayers: Player[], nextHistory: MatchRecord[]) => {
      setPlayers(nextPlayers);
      setHistory(nextHistory);
      const client = supabase;
      if (!client || !userId) return;

      const result = await upsertRow(
        client,
        userId,
        nextPlayers,
        nextHistory,
        settings,
        supportsSettings,
        isOwner,
        cloudUpdatedAt.current,
      );
      if (!result.success) {
        if (result.conflict) await adoptCloud();
        return;
      }
      cloudFingerprint.current = fingerprint(nextPlayers, nextHistory, settings);
      cloudUpdatedAt.current = result.updatedAt;
      setLastSyncedAt(result.updatedAt);
      setStatus('synced');
    },
    [userId, isOwner, settings, setPlayers, setHistory, adoptCloud],
  );

  return {
    players,
    setPlayers,
    history,
    setHistory,
    settings,
    setSettings,
    settingsSynced,
    status,
    lastSyncedAt,
    error,
    flush,
  };
}

/* ------------------------------------------------------------------ */

type Client = NonNullable<typeof supabase>;

const helperKeys = (ownerId: string) => ({
  players: `${STORAGE_KEYS.players}@${ownerId}`,
  history: `${STORAGE_KEYS.history}@${ownerId}`,
  settings: `${STORAGE_KEYS.settings}@${ownerId}`,
});

/** What the database's helper rule says, in words a helper can act on */
const helperMessage = (message: string) =>
  /existing players|remove players/.test(message)
    ? 'עוזר לא יכול לשנות או למחוק שחקן קיים — השינוי לא נשמר'
    : message;

const CONFLICT_MESSAGE = 'הקבוצה עודכנה באותו רגע ממכשיר אחר — השינוי האחרון שלך לא נשמר. אפשר לעשות אותו שוב';

const isMissingSettings = (error: { code?: string; message: string }) =>
  error.code === MISSING_COLUMN || /settings/i.test(error.message);

type SaveResult = { success: boolean; updatedAt: string; message?: string; conflict?: boolean };

/**
 * Writes the document. When the row is already known (`expected` is the updated_at this
 * device last saw), it is a conditional update: it only lands if nobody saved in between,
 * which matters now that an owner and a helper can edit the same squad. Without a known
 * row (the owner's first sign-in) it's the original upsert.
 *
 * If the settings column is missing, retries without it and marks settings as local-only.
 */
async function upsertRow(
  client: Client,
  userId: string,
  players: Player[],
  history: MatchRecord[],
  settings: AppSettings,
  supportsSettings: { current: boolean },
  isOwner: boolean,
  expected: string | null,
): Promise<SaveResult> {
  const updatedAt = new Date().toISOString();

  if (expected) {
    const write = (withSettings: boolean) =>
      client
        .from(TABLE)
        .update(
          withSettings
            ? { players, history, settings, updated_at: updatedAt }
            : { players, history, updated_at: updatedAt },
        )
        .eq('user_id', userId)
        .eq('updated_at', expected)
        .select('user_id');

    let { data, error } = await write(supportsSettings.current);
    if (error && supportsSettings.current && isMissingSettings(error)) {
      supportsSettings.current = false;
      ({ data, error } = await write(false));
    }
    if (error) {
      return { success: false, updatedAt, message: isOwner ? error.message : helperMessage(error.message) };
    }
    // Nothing matched: the row moved on since this device last saw it (or access is gone)
    if (!data?.length) return { success: false, updatedAt, conflict: true, message: CONFLICT_MESSAGE };
    return { success: true, updatedAt };
  }

  // A helper never creates the owner's row
  if (!isOwner) return { success: false, updatedAt, message: 'אין גישה לקבוצה הזו' };

  const base = { user_id: userId, players, history, updated_at: updatedAt };
  if (supportsSettings.current) {
    const { error } = await client.from(TABLE).upsert({ ...base, settings });
    if (!error) return { success: true, updatedAt };
    if (!isMissingSettings(error)) return { success: false, updatedAt, message: error.message };
    supportsSettings.current = false; // ננסה שוב בלי ההגדרות
  }

  const { error } = await client.from(TABLE).upsert(base);
  return error
    ? { success: false, updatedAt, message: error.message }
    : { success: true, updatedAt };
}
