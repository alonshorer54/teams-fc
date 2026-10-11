import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface Squad {
  /** The owner's user id — the squad's row in kohot_data */
  ownerId: string;
  isOwner: boolean;
  /** Shown in the switcher: "הקבוצה שלי" or the owner's email */
  label: string;
}

interface MembershipRow {
  owner_id: string;
  owner_email: string;
  accepted: boolean;
}

/**
 * The squads the signed-in user can open: their own, plus every squad they accepted to help
 * with. Invitations not yet accepted come back separately, to be accepted or declined.
 * `ready` stays false until the memberships are known, so the app never mounts the wrong
 * squad first and starts syncing it.
 */
export function useSquads(userId: string | null, claimedAt: number) {
  const [rows, setRows] = useState<MembershipRow[]>([]);
  const [readyFor, setReadyFor] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const client = supabase;
    if (!client || !userId) return;
    let cancelled = false;

    client
      .from('kohot_members')
      .select('owner_id, owner_email, accepted')
      .eq('user_id', userId)
      .then(({ data, error }) => {
        if (cancelled) return;
        // Before supabase-sharing.sql has run the table doesn't exist: own squad only
        setRows(error ? [] : ((data ?? []) as MembershipRow[]));
        setReadyFor(userId);
      });

    return () => {
      cancelled = true;
    };
  }, [userId, claimedAt, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  const known = readyFor === userId ? rows : [];
  const toSquad = (m: MembershipRow): Squad => ({
    ownerId: m.owner_id,
    isOwner: false,
    label: m.owner_email || 'קבוצה משותפת',
  });
  const helping = known.filter((m) => m.accepted).map(toSquad);
  const own: Squad[] = userId ? [{ ownerId: userId, isOwner: true, label: 'הקבוצה שלי' }] : [];

  return {
    squads: [...own, ...helping],
    helping,
    /** Invitations waiting for a yes or no */
    invitations: known.filter((m) => !m.accepted).map(toSquad),
    ready: !userId || readyFor === userId,
    reload,
  };
}

/** Accepts or declines an invitation, or leaves a squad (decline and leave are the same). */
export async function answerInvitation(ownerId: string, userId: string, accept: boolean) {
  if (!supabase) return 'הענן אינו מוגדר';
  const query = accept
    ? supabase.from('kohot_members').update({ accepted: true }).eq('owner_id', ownerId).eq('user_id', userId)
    : supabase.from('kohot_members').delete().eq('owner_id', ownerId).eq('user_id', userId);
  const { error } = await query;
  return error ? error.message : null;
}
