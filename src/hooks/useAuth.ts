import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { isCloudConfigured, supabase, translateAuthError } from '../lib/supabase';

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!isCloudConfigured);

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    if (!supabase) return 'הענן אינו מוגדר';
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? translateAuthError(error.message) : null;
  };

  const signUp = async (email: string, password: string) => {
    if (!supabase) return 'הענן אינו מוגדר';
    const { error } = await supabase.auth.signUp({ email, password });
    return error ? translateAuthError(error.message) : null;
  };

  const signOut = async () => {
    await supabase?.auth.signOut();
  };

  return { session, userId: session?.user.id ?? null, email: session?.user.email ?? null, ready, signIn, signUp, signOut };
}
