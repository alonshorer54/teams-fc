import { useCallback, useEffect, useRef, useState } from 'react';
import type { MatchRecord, Player } from '../types';
import {
  STORAGE_KEYS,
  defaultSettings,
  loadJSON,
  normalizeSettings,
  saveJSON,
  type AppSettings,
} from '../lib/storage';
import { TABLE, isCloudConfigured, supabase } from '../lib/supabase';
import { useLocalStorage } from './useLocalStorage';

export type SyncStatus = 'local' | 'loading' | 'synced' | 'saving' | 'error';

export type FlushResult = 'saved' | 'later' | 'refused';

const SAVE_DEBOUNCE_MS = 900;

/** A save that failed for a reason other than a conflict is tried again after this, doubling up to the max */
const RETRY_FIRST_MS = 5_000;
const RETRY_MAX_MS = 120_000;

/** קוד השגיאה ש-PostgREST מחזיר כשעמודה לא קיימת בסכמה */
const MISSING_COLUMN = 'PGRST204';

const fingerprint = (players: Player[], history: MatchRecord[], settings: AppSettings) =>
  JSON.stringify({ players, history, settings });

/**
 * A local change that hasn't reached the cloud, kept in localStorage so it survives the app
 * being closed or reloaded. `base` is the row's updated_at the change was made on top of;
 * `writing` is the updated_at of a save that was on its way when the page went away.
 */
interface Pending {
  /** The account whose squad this is — a marker left by someone else means nothing here */
  owner: string;
  base: string | null;
  writing?: string;
}

const PENDING_LOST =
  'שינויים שנעשו במכשיר הזה ולא הגיעו לענן לא נשמרו — הקבוצה עודכנה בינתיים ממכשיר אחר';

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
  /** Something the person must hear about even though syncing carries on (changes that were lost) */
  const [notice, setNotice] = useState<string | null>(null);
  /** Bumped to make the save effect look again: after a failed save, back online, back on screen */
  const [retryTick, setRetryTick] = useState(0);
  /** Bumped to load again after the first load failed for lack of network */
  const [loadAttempt, setLoadAttempt] = useState(0);

  /** טביעת האצבע של המידע שכבר נמצא בענן — מונע כתיבות מיותרות ולולאות הד. */
  const cloudFingerprint = useRef<string | null>(null);
  const hydrated = useRef(false);
  const saveTimer = useRef<number | undefined>(undefined);
  const retryTimer = useRef<number | undefined>(undefined);
  const retryDelay = useRef(RETRY_FIRST_MS);
  /** A change failed to send for lack of network and is waiting to go out again */
  const retryWaiting = useRef(false);
  const supportsSettings = useRef(true);
  /**
   * The row's updated_at as this device last saw it. A save only goes through if the row
   * still carries it — otherwise someone else (the owner or a helper) saved in between, and
   * writing the whole document now would silently wipe their change.
   */
  const cloudUpdatedAt = useRef<string | null>(null);
  /** שמירה מקומית ממתינה (בהשהיה) — שינוי מקומי שעוד לא נשלח */
  const timerArmed = useRef(false);
  /** כמה שמירות נשלחו ועוד לא חזרו */
  const inFlight = useRef(0);
  /** השמירות נשלחות אחת אחרי השנייה — ראו את האפקט של השמירה */
  const saveChain = useRef<Promise<void>>(Promise.resolve());
  /** עולה בכל פעם שהמכשיר מאמץ את הענן, כדי ששמירה שחיכתה בתור לא תדרוס אותו */
  const adoptions = useRef(0);
  /** שינוי מקומי שעוד לא הגיע לענן — ממתין או בדרך */
  const isSaving = () => timerArmed.current || inFlight.current > 0;
  /** ה-updated_at של השמירות שלנו, כדי לזהות את ההד שלהן בערוץ הזמן-אמת */
  const ownWrites = useRef(new Set<string>());
  /** שינוי ממכשיר אחר הגיע בזמן ששמרנו, ועוד לא נלקח */
  const missedRemote = useRef(false);

  const readPending = useCallback(() => {
    const p = loadJSON<Pending | null>(keys.pending, null);
    return p && p.owner === userId ? p : null;
  }, [keys.pending, userId]);
  const writePending = useCallback((p: Omit<Pending, 'owner'> | null) => {
    if (p && userId) saveJSON(keys.pending, { ...p, owner: userId });
    else {
      try {
        localStorage.removeItem(keys.pending);
      } catch {
        // storage blocked: nothing was kept there either
      }
    }
  }, [keys.pending, userId]);

  const scheduleRetry = useCallback(() => {
    retryWaiting.current = true;
    window.clearTimeout(retryTimer.current);
    retryTimer.current = window.setTimeout(() => setRetryTick((n) => n + 1), retryDelay.current);
    retryDelay.current = Math.min(retryDelay.current * 2, RETRY_MAX_MS);
  }, []);

  // A save that failed offline goes out as soon as there's a network, or the app is opened again
  useEffect(() => {
    const again = () => {
      if (document.visibilityState === 'visible') setRetryTick((n) => n + 1);
    };
    window.addEventListener('online', again);
    document.addEventListener('visibilitychange', again);
    return () => {
      window.removeEventListener('online', again);
      document.removeEventListener('visibilitychange', again);
      window.clearTimeout(retryTimer.current);
    };
  }, []);

  /** Replaces local state with what the database holds, after a refused or conflicting save. */
  const adoptCloud = useCallback(async (unlessSaving = false): Promise<boolean> => {
    const client = supabase;
    if (!client || !userId) return false;
    const { data } = await client.from(TABLE).select('*').eq('user_id', userId).maybeSingle();
    if (!data) return false;
    // נלחץ משהו בזמן ההבאה: אימוץ עכשיו היה מוחק אותו. השמירה שלו תיתקל בהתנגשות
    // ותאמץ את הענן בעצמה
    if (unlessSaving && isSaving()) {
      missedRemote.current = true;
      return false;
    }
    adoptions.current += 1;
    missedRemote.current = false;
    writePending(null);
    const cloudSettings = normalizeSettings((data.settings ?? {}) as Partial<AppSettings>);
    cloudFingerprint.current = fingerprint(data.players ?? [], data.history ?? [], cloudSettings);
    cloudUpdatedAt.current = data.updated_at ?? null;
    setPlayers((data.players ?? []) as Player[]);
    setHistory((data.history ?? []) as MatchRecord[]);
    setSettings(cloudSettings);
    return true;
  }, [userId, setPlayers, setHistory, setSettings, writePending]);

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
        // Offline at start: try again once there's a network, rather than staying stuck
        scheduleRetryLoad();
        return;
      }

      if (data) {
        const cloudPlayers = (data.players ?? []) as Player[];
        const cloudHistory = (data.history ?? []) as MatchRecord[];
        const cloudSettings: AppSettings =
          hasSettingsColumn && data.settings
            ? normalizeSettings(data.settings as Partial<AppSettings>)
            : settings;
        const cloudPrint = fingerprint(cloudPlayers, cloudHistory, cloudSettings);
        cloudUpdatedAt.current = data.updated_at ?? null;
        cloudFingerprint.current = cloudPrint;

        // A change made here that never reached the cloud (no signal, app closed or reloaded
        // in the middle of a save). If nobody saved since, it is newer than the cloud: keep
        // it, and the save effect sends it. Otherwise the cloud wins, and the person is told.
        const pending = readPending();
        const localIsNewer =
          !!pending &&
          !!data.updated_at &&
          (pending.base === data.updated_at || pending.writing === data.updated_at);

        if (localIsNewer) {
          if (isOwner) saveJSON(STORAGE_KEYS.owner, userId);
          hydrated.current = true;
          setStatus('saving');
          setRetryTick((n) => n + 1);
          return;
        }

        if (pending && fingerprint(players, history, settings) !== cloudPrint) setNotice(PENDING_LOST);
        writePending(null);
        setPlayers(cloudPlayers);
        setHistory(cloudHistory);
        if (hasSettingsColumn && data.settings) setSettings(cloudSettings);
        setLastSyncedAt(data.updated_at ?? new Date().toISOString());
      } else if (!isOwner) {
        // A helper never creates a squad; a missing row means access was removed
        setError('אין גישה לקבוצה הזו');
        setStatus('error');
        return;
      } else {
        // התחברות ראשונה — מעלים את מה שכבר קיים במכשיר, אבל רק אם הוא לא של חשבון אחר
        const localOwner = loadJSON<string | null>(STORAGE_KEYS.owner, null);
        const mine = !localOwner || localOwner === userId;
        const first = mine
          ? { players, history, settings }
          : { players: [] as Player[], history: [] as MatchRecord[], settings: defaultSettings() };
        if (!mine) {
          setPlayers(first.players);
          setHistory(first.history);
          setSettings(first.settings);
        }
        const ok = await upsertRow(client, userId, first.players, first.history, first.settings, supportsSettings, isOwner, null);
        if (cancelled) return;
        if (!ok.success) {
          setError(ok.message ?? 'שמירה ראשונית נכשלה');
          setStatus('error');
          return;
        }
        writePending(null);
        cloudFingerprint.current = fingerprint(first.players, first.history, first.settings);
        cloudUpdatedAt.current = ok.updatedAt;
        setLastSyncedAt(new Date().toISOString());
      }

      if (isOwner) saveJSON(STORAGE_KEYS.owner, userId);
      hydrated.current = true;
      setStatus('synced');
    })();

    // The first load failed: load again when the network is back, or in a while anyway (a
    // server error while online never fires 'online'), by running this effect again
    let loadRetry: number | undefined;
    const loadAgain = () => {
      if (!cancelled) setLoadAttempt((n) => n + 1);
    };
    function scheduleRetryLoad() {
      window.addEventListener('online', loadAgain, { once: true });
      loadRetry = window.setTimeout(loadAgain, 15_000);
    }

    return () => {
      cancelled = true;
      window.removeEventListener('online', loadAgain);
      window.clearTimeout(loadRetry);
    };
    // טעינה חד-פעמית לכל משתמש; הנתונים המקומיים נקראים כאן בכוונה כערך התחלתי
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, loadAttempt]);

  /* --------------------------- שמירה אוטומטית --------------------------- */

  useEffect(() => {
    const client = supabase;
    if (!client || !userId || !hydrated.current) return;

    const current = fingerprint(players, history, settings);
    if (current === cloudFingerprint.current) {
      // אין שינוי אמיתי — למשל סימון שבוטל בתוך ההשהיה. אין שמירה שתיתקל בהתנגשות,
      // אז שינוי ממכשיר אחר שדילגנו עליו בינתיים נלקח כאן
      if (!inFlight.current) {
        writePending(null);
        if (missedRemote.current) {
          missedRemote.current = false;
          void adoptCloud(true);
        }
        setStatus((s) => (s === 'saving' ? 'synced' : s));
      }
      return;
    }

    // Recorded before the save is even scheduled: closing the app inside the debounce, or a
    // reload for a new version, must not lose this change
    const pending = readPending();
    if (!pending) writePending({ base: cloudUpdatedAt.current });

    setStatus('saving');
    timerArmed.current = true;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      timerArmed.current = false;
      inFlight.current += 1;
      const adoptedBefore = adoptions.current;
      // שמירה אחת בכל רגע. שמירה שנשלחת בזמן שהקודמת עוד בדרך נושאת את ה-updated_at
      // שלפניה, הענן דוחה אותה כהתנגשות והמכשיר חוזר למה שבענן — וכך סימון תשלום
      // שנלחץ בזמן העלאה נעלם, או מחק סימון אחר שנלחץ אחריו (21.10)
      saveChain.current = saveChain.current.then(async () => {
        try {
          // המכשיר אימץ את הענן בינתיים: מה שחיכה כאן כבר לא המצב שלו
          if (adoptions.current !== adoptedBefore) return;
          // Already in the cloud — a save queued twice (a retry or the app coming back to the
          // screen while the first was on its way). Sending the whole document again is waste
          if (current === cloudFingerprint.current) {
            if (!timerArmed.current && inFlight.current === 1) {
              writePending(null);
              setStatus('synced');
            }
            return;
          }
          const updatedAt = new Date().toISOString();
          ownWrites.current.add(updatedAt);
          writePending({ base: cloudUpdatedAt.current, writing: updatedAt });
          const result = await upsertRow(
            client,
            userId,
            players,
            history,
            settings,
            supportsSettings,
            isOwner,
            cloudUpdatedAt.current,
            updatedAt,
          );
          if (!result.success) {
            ownWrites.current.delete(updatedAt);
            writePending({ base: cloudUpdatedAt.current });
            setError(result.message ?? 'השמירה נכשלה');
            setStatus('error');
            // No network (or a passing server error): the change stays here and goes out later
            if (result.retry) {
              scheduleRetry();
              return;
            }
            // A conflicting or refused change would otherwise be retried with every later edit;
            // take what the database holds, so the next edit starts from the real squad
            if ((result.conflict || !isOwner) && !(await adoptCloud())) setError('אין גישה לקבוצה הזו');
            return;
          }
          retryDelay.current = RETRY_FIRST_MS;
          retryWaiting.current = false;
          setSettingsSynced(supportsSettings.current);
          cloudFingerprint.current = current;
          cloudUpdatedAt.current = result.updatedAt;
          setLastSyncedAt(result.updatedAt);
          setError(null);
          if (!timerArmed.current && inFlight.current === 1) {
            writePending(null);
            setStatus('synced');
          } else {
            // Another change is already waiting; it now builds on this save
            writePending({ base: result.updatedAt });
          }
        } finally {
          inFlight.current -= 1;
          // A change waiting to be sent again isn't thrown away for the remote one: its retry
          // meets the conflict and takes the cloud then, with the message that says so
          if (!isSaving() && !retryWaiting.current && missedRemote.current) {
            missedRemote.current = false;
            void adoptCloud(true);
          }
        }
      })
        // שמירה שזרקה (רשת שנפלה) לא תתקע את כל השמירות שאחריה בתור
        .catch((e: unknown) => {
          setError(e instanceof Error ? e.message : 'השמירה נכשלה');
          setStatus('error');
          scheduleRetry();
        });
    }, SAVE_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(saveTimer.current);
      // שינוי שבוטל לפני שנשלח לא ישאיר את הדגל דלוק לתמיד; שינוי חדש ידליק אותו שוב
      timerArmed.current = false;
    };
  }, [players, history, settings, userId, isOwner, adoptCloud, retryTick, readPending, writePending, scheduleRetry]);

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
          // ההד של שמירה שלנו — כבר יודעים מה יש בו
          if (row.updated_at && ownWrites.current.delete(row.updated_at)) return;
          // שינוי ממכשיר אחר בזמן שינוי מקומי שעוד לא הגיע לענן: אימוץ עכשיו היה מחזיר
          // את המסך למצב שלפני הלחיצות האחרונות. השמירה שלנו תיתקל בהתנגשות ותאמץ את
          // הענן בעצמה, ואם לא תהיה שמירה — הוא נלקח כשהכל נרגע
          if (isSaving() || retryWaiting.current) {
            missedRemote.current = true;
            return;
          }
          if (!row.players) {
            // מעל 1MB ה-Realtime שולח את השורה בלי העמודות הגדולות. במקום לפספס את
            // השינוי בשקט — מביאים את השורה עצמה (אלא אם זה ההד של השמירה שלנו)
            if (row.updated_at && row.updated_at !== cloudUpdatedAt.current) {
              void adoptCloud(true).then((ok) => {
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

  /**
   * דחיפה מיידית לענן — לשימוש אחרי ייבוא גיבוי.
   * Resolves to what happened: `saved` in the cloud; `later` — kept on this device and sent
   * again automatically; `refused` — someone saved at the same moment, and the device took
   * their version instead, so the change is gone and has to be made again.
   */
  const flush = useCallback(
    async (
      nextPlayers: Player[],
      nextHistory: MatchRecord[],
      nextSettings?: AppSettings,
    ): Promise<FlushResult> => {
      const sendSettings = nextSettings ?? settings;
      setPlayers(nextPlayers);
      setHistory(nextHistory);
      if (nextSettings) setSettings(nextSettings);
      const client = supabase;
      if (!client || !userId) return 'saved';

      // בתור עם השמירות הרגילות, מאותה סיבה
      inFlight.current += 1;
      const step = saveChain.current.then(async (): Promise<FlushResult> => {
        try {
          const updatedAt = new Date().toISOString();
          ownWrites.current.add(updatedAt);
          const result = await upsertRow(
            client,
            userId,
            nextPlayers,
            nextHistory,
            sendSettings,
            supportsSettings,
            isOwner,
            cloudUpdatedAt.current,
            updatedAt,
          );
          if (!result.success) {
            ownWrites.current.delete(updatedAt);
            setError(result.message ?? 'השמירה נכשלה');
            setStatus('error');
            if (result.conflict) {
              await adoptCloud();
              return 'refused';
            }
            scheduleRetry();
            return 'later';
          }
          retryWaiting.current = false;
          cloudFingerprint.current = fingerprint(nextPlayers, nextHistory, sendSettings);
          cloudUpdatedAt.current = result.updatedAt;
          setLastSyncedAt(result.updatedAt);
          setError(null);
          setStatus('synced');
          return 'saved';
        } finally {
          inFlight.current -= 1;
        }
      });
      saveChain.current = step.then(
        () => undefined,
        () => undefined,
      );
      return step.catch((): FlushResult => {
        scheduleRetry();
        return 'later';
      });
    },
    [userId, isOwner, settings, setPlayers, setHistory, setSettings, adoptCloud, scheduleRetry],
  );

  return {
    players,
    setPlayers,
    history,
    setHistory,
    settings,
    setSettings,
    settingsSynced,
    notice,
    clearNotice: () => setNotice(null),
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
  pending: `${STORAGE_KEYS.pending}@${ownerId}`,
});

/** What the database's helper rule says, in words a helper can act on */
const helperMessage = (message: string) =>
  /existing players|remove players|ratings/.test(message)
    ? 'עוזר לא יכול לשנות או למחוק שחקן קיים — השינוי לא נשמר'
    : message;

const CONFLICT_MESSAGE = 'הקבוצה עודכנה באותו רגע ממכשיר אחר — השינוי האחרון שלך לא נשמר. אפשר לעשות אותו שוב';

const OFFLINE_MESSAGE = 'אין חיבור לענן — השינוי שמור במכשיר ויישלח כשהחיבור יחזור';

const isMissingSettings = (error: { code?: string; message: string }) =>
  error.code === MISSING_COLUMN || /settings/i.test(error.message);

/**
 * A failure that says nothing about the change itself — no network, a timeout, the server
 * briefly down. Postgres refusals (the helper rule, RLS) carry a SQLSTATE code instead.
 */
const isTransient = (error: { code?: string; message: string }) =>
  !error.code || /fetch|network|load failed|timeout/i.test(error.message);

type SaveResult = {
  success: boolean;
  updatedAt: string;
  message?: string;
  conflict?: boolean;
  /** Worth sending again later: nothing was wrong with the change */
  retry?: boolean;
};

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
  updatedAt = new Date().toISOString(),
): Promise<SaveResult> {
  const failed = (error: { code?: string; message: string }): SaveResult =>
    isTransient(error)
      ? { success: false, updatedAt, retry: true, message: OFFLINE_MESSAGE }
      : { success: false, updatedAt, message: isOwner ? error.message : helperMessage(error.message) };

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
    if (error) return failed(error);
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
    if (!isMissingSettings(error)) return failed(error);
    supportsSettings.current = false; // ננסה שוב בלי ההגדרות
  }

  const { error } = await client.from(TABLE).upsert(base);
  return error ? failed(error) : { success: true, updatedAt };
}
