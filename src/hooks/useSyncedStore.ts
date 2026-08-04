import { useCallback, useEffect, useRef, useState } from 'react';
import type { MatchRecord, Player } from '../types';
import { STORAGE_KEYS } from '../lib/storage';
import { TABLE, isCloudConfigured, supabase } from '../lib/supabase';
import { useLocalStorage } from './useLocalStorage';

export type SyncStatus = 'local' | 'loading' | 'synced' | 'saving' | 'error';

const SAVE_DEBOUNCE_MS = 900;

const fingerprint = (players: Player[], history: MatchRecord[]) =>
  JSON.stringify({ players, history });

/**
 * מחזיק את השחקנים וההיסטוריה, ומסנכרן אותם בין localStorage לענן.
 *
 * - ללא חשבון (או ללא הגדרות ענן) — עובד מקומית בלבד, בדיוק כמו קודם.
 * - עם חשבון — טוען מהענן בכניסה, שומר אוטומטית בכל שינוי,
 *   ומאזין לשינויים ממכשירים אחרים בזמן אמת.
 */
export function useSyncedStore(userId: string | null) {
  const [players, setPlayers] = useLocalStorage<Player[]>(STORAGE_KEYS.players, []);
  const [history, setHistory] = useLocalStorage<MatchRecord[]>(STORAGE_KEYS.history, []);

  const [status, setStatus] = useState<SyncStatus>(isCloudConfigured ? 'loading' : 'local');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** טביעת האצבע של המידע שכבר נמצא בענן — מונע כתיבות מיותרות ולולאות הד. */
  const cloudFingerprint = useRef<string | null>(null);
  const hydrated = useRef(false);
  const saveTimer = useRef<number | undefined>(undefined);

  /* ------------------------- טעינה ראשונית מהענן ------------------------- */

  useEffect(() => {
    if (!supabase || !userId) {
      hydrated.current = false;
      cloudFingerprint.current = null;
      setStatus(isCloudConfigured ? 'loading' : 'local');
      return;
    }

    let cancelled = false;
    setStatus('loading');
    setError(null);

    (async () => {
      const { data, error: fetchError } = await supabase
        .from(TABLE)
        .select('players, history, updated_at')
        .eq('user_id', userId)
        .maybeSingle();

      if (cancelled) return;

      if (fetchError) {
        setError(fetchError.message);
        setStatus('error');
        return;
      }

      if (data) {
        // יש נתונים בענן — הם מקור האמת
        const cloudPlayers = (data.players ?? []) as Player[];
        const cloudHistory = (data.history ?? []) as MatchRecord[];
        setPlayers(cloudPlayers);
        setHistory(cloudHistory);
        cloudFingerprint.current = fingerprint(cloudPlayers, cloudHistory);
        setLastSyncedAt(data.updated_at ?? new Date().toISOString());
      } else {
        // התחברות ראשונה — מעלים את מה שכבר קיים במכשיר
        const { error: seedError } = await supabase.from(TABLE).upsert({
          user_id: userId,
          players,
          history,
          updated_at: new Date().toISOString(),
        });
        if (cancelled) return;
        if (seedError) {
          setError(seedError.message);
          setStatus('error');
          return;
        }
        cloudFingerprint.current = fingerprint(players, history);
        setLastSyncedAt(new Date().toISOString());
      }

      hydrated.current = true;
      setStatus('synced');
    })();

    return () => {
      cancelled = true;
    };
    // players/history מכוונים להישאר מחוץ לתלויות: זו טעינה חד-פעמית לכל משתמש
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  /* --------------------------- שמירה אוטומטית --------------------------- */

  useEffect(() => {
    const client = supabase;
    if (!client || !userId || !hydrated.current) return;

    const current = fingerprint(players, history);
    if (current === cloudFingerprint.current) return; // אין שינוי אמיתי

    setStatus('saving');
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      const updatedAt = new Date().toISOString();
      const { error: saveError } = await client
        .from(TABLE)
        .upsert({ user_id: userId, players, history, updated_at: updatedAt });

      if (saveError) {
        setError(saveError.message);
        setStatus('error');
        return;
      }
      cloudFingerprint.current = current;
      setLastSyncedAt(updatedAt);
      setError(null);
      setStatus('synced');
    }, SAVE_DEBOUNCE_MS);

    return () => window.clearTimeout(saveTimer.current);
  }, [players, history, userId]);

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
          const row = payload.new as { players?: Player[]; history?: MatchRecord[]; updated_at?: string };
          if (!row?.players) return;

          const incoming = fingerprint(row.players, row.history ?? []);
          if (incoming === cloudFingerprint.current) return; // זה ההד של השמירה שלנו

          cloudFingerprint.current = incoming;
          setPlayers(row.players);
          setHistory(row.history ?? []);
          setLastSyncedAt(row.updated_at ?? new Date().toISOString());
          setStatus('synced');
        },
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [userId, setPlayers, setHistory]);

  /** דחיפה מיידית לענן — לשימוש אחרי ייבוא גיבוי. */
  const flush = useCallback(
    async (nextPlayers: Player[], nextHistory: MatchRecord[]) => {
      setPlayers(nextPlayers);
      setHistory(nextHistory);
      if (!supabase || !userId) return;
      const updatedAt = new Date().toISOString();
      await supabase
        .from(TABLE)
        .upsert({ user_id: userId, players: nextPlayers, history: nextHistory, updated_at: updatedAt });
      cloudFingerprint.current = fingerprint(nextPlayers, nextHistory);
      setLastSyncedAt(updatedAt);
      setStatus('synced');
    },
    [userId, setPlayers, setHistory],
  );

  return { players, setPlayers, history, setHistory, status, lastSyncedAt, error, flush };
}
