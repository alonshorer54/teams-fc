import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface Squad {
  /** The owner's user id — the squad's row in kohot_data */
  ownerId: string;
  isOwner: boolean;
  /** Shown in the switcher: "הקבוצה שלי" or the owner's email */
  label: string;
}

/**
 * The squads the signed-in user can open: their own, plus every squad they were invited to
 * help with. `ready` stays false until the memberships are known, so the app never mounts
 * the wrong squad first and starts syncing it.
 */
export function useSquads(userId: string | null, claimedAt: number) {
  const [helping, setHelping] = useState<Squad[]>([]);
  const [readyFor, setReadyFor] = useState<string | null>(null);

  useEffect(() => {
    const client = supabase;
    if (!client || !userId) return;
    let cancelled = false;

    client
      .from('kohot_members')
      .select('owner_id, owner_email')
      .eq('user_id', userId)
      .then(({ data, error }) => {
        if (cancelled) return;
        // Before supabase-sharing.sql has run the table doesn't exist: own squad only
        setHelping(
          error
            ? []
            : (data ?? []).map((m: { owner_id: string; owner_email: string }) => ({
                ownerId: m.owner_id,
                isOwner: false,
                label: m.owner_email || 'קבוצה משותפת',
              })),
        );
        setReadyFor(userId);
      });

    return () => {
      cancelled = true;
    };
  }, [userId, claimedAt]);

  const own: Squad[] = userId ? [{ ownerId: userId, isOwner: true, label: 'הקבוצה שלי' }] : [];
  return {
    squads: [...own, ...(readyFor === userId ? helping : [])],
    /** Helped squads only — used to pick a sensible default */
    helping: readyFor === userId ? helping : [],
    ready: !userId || readyFor === userId,
  };
}
