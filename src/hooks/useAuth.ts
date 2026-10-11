import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { isCloudConfigured, supabase, translateAuthError } from '../lib/supabase';

/** Where Supabase sends the user back after Google */
const redirectUrl = () => `${window.location.origin}${import.meta.env.BASE_URL}`;

/**
 * Whether the session came from Google. Sign-in is Google-only, and the database only serves
 * Google sessions; a password session left over from before the switch is signed out so the
 * person lands on the Google button instead of an app that can't load anything.
 */
function isGoogleSession(session: Session): boolean {
  try {
    const payload = JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return Array.isArray(payload.amr) && payload.amr.some((m: { method?: string }) => m.method === 'oauth');
  } catch {
    return false;
  }
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!isCloudConfigured);
  /** Bumped after invites were turned into memberships, so the squad list reloads */
  const [claimedAt, setClaimedAt] = useState(0);

  useEffect(() => {
    const client = supabase;
    if (!client) return;

    const accept = (next: Session | null) => {
      if (next && !isGoogleSession(next)) {
        void client.auth.signOut();
        setSession(null);
        return;
      }
      setSession(next);
    };

    client.auth.getSession().then(({ data }) => {
      accept(data.session);
      setReady(true);
    });

    const { data: sub } = client.auth.onAuthStateChange((_event, next) => accept(next));
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id ?? null;

  // Every sign-in may bring invites sent to this Gmail address since the last one
  useEffect(() => {
    if (!supabase || !userId) return;
    supabase.rpc('kohot_claim_invites').then(({ data, error }) => {
      // Before supabase-sharing.sql has run the function doesn't exist; sharing just stays off
      if (!error && data) setClaimedAt(Date.now());
    });
  }, [userId]);

  const signInWithGoogle = async (): Promise<string | null> => {
    if (!supabase) return 'הענן אינו מוגדר';
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectUrl() },
    });
    return error ? translateAuthError(error.message) : null;
  };

  const signOut = async () => {
    await supabase?.auth.signOut();
  };

  return {
    session,
    userId,
    email: session?.user.email ?? null,
    ready,
    claimedAt,
    signInWithGoogle,
    signOut,
  };
}
