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
        setLastSyncedAt(data.updated_at ?? new Date().toISOString());
      } else if (!isOwner) {
        // A helper never creates a squad; a missing row means access was removed
        setError('אין גישה לקבוצה הזו');
        setStatus('error');
        return;
      } else {
        // התחברות ראשונה — מעלים את מה שכבר קיים במכשיר
        const ok = await upsertRow(client, userId, players, history, settings, supportsSettings, isOwner);
        if (cancelled) return;
        if (!ok.success) {
          setError(ok.message ?? 'שמירה ראשונית נכשלה');
          setStatus('error');
          return;
        }
        cloudFingerprint.current = fingerprint(players, history, settings);
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
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      const result = await upsertRow(client, userId, players, history, settings, supportsSettings, isOwner);
      if (!result.success) {
        setError(result.message ?? 'השמירה נכשלה');
        setStatus('error');
        // A helper's refused change would otherwise be retried with every later edit and
        // block them for good; go back to what the database holds instead
        if (!isOwner) {
          const { data } = await client.from(TABLE).select('*').eq('user_id', userId).maybeSingle();
          if (data) {
            const cloudSettings = normalizeSettings((data.settings ?? {}) as Partial<AppSettings>);
            cloudFingerprint.current = fingerprint(data.players ?? [], data.history ?? [], cloudSettings);
            setPlayers((data.players ?? []) as Player[]);
            setHistory((data.history ?? []) as MatchRecord[]);
            setSettings(cloudSettings);
          }
        }
        return;
      }
      setSettingsSynced(supportsSettings.current);
      cloudFingerprint.current = current;
      setLastSyncedAt(result.updatedAt);
      setError(null);
      setStatus('synced');
    }, SAVE_DEBOUNCE_MS);

    return () => window.clearTimeout(saveTimer.current);
  }, [players, history, settings, userId, isOwner, setPlayers, setHistory, setSettings]);

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
          if (!row?.players) return;

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
  }, [userId, setPlayers, setHistory, setSettings]);

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
      );
      if (!result.success) return;
      cloudFingerprint.current = fingerprint(nextPlayers, nextHistory, settings);
      setLastSyncedAt(result.updatedAt);
      setStatus('synced');
    },
    [userId, isOwner, settings, setPlayers, setHistory],
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

/**
 * כותב את השורה, ואם עמודת ההגדרות חסרה — מנסה שוב בלעדיה
 * ומסמן שההגדרות נשארות מקומיות.
 */
async function upsertRow(
  client: Client,
  userId: string,
  players: Player[],
  history: MatchRecord[],
  settings: AppSettings,
  supportsSettings: { current: boolean },
  isOwner = true,
): Promise<{ success: boolean; updatedAt: string; message?: string }> {
  const updatedAt = new Date().toISOString();
  const base = { user_id: userId, players, history, updated_at: updatedAt };

  // A helper may only update the owner's row: an upsert would also need INSERT rights
  if (!isOwner) {
    const { data, error } = await client
      .from(TABLE)
      .update({ players, history, settings, updated_at: updatedAt })
      .eq('user_id', userId)
      .select('user_id');
    if (error) return { success: false, updatedAt, message: helperMessage(error.message) };
    if (!data?.length) return { success: false, updatedAt, message: 'אין גישה לקבוצה הזו' };
    return { success: true, updatedAt };
  }

  if (supportsSettings.current) {
    const { error } = await client.from(TABLE).upsert({ ...base, settings });
    if (!error) return { success: true, updatedAt };

    const missing = error.code === MISSING_COLUMN || /settings/i.test(error.message);
    if (!missing) return { success: false, updatedAt, message: error.message };
    supportsSettings.current = false; // ננסה שוב בלי ההגדרות
  }

  const { error } = await client.from(TABLE).upsert(base);
  return error
    ? { success: false, updatedAt, message: error.message }
    : { success: true, updatedAt };
}
