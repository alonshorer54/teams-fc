import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { isCloudConfigured, supabase, translateAuthError } from '../lib/supabase';

/** הכתובת שאליה Supabase יחזיר את המשתמש אחרי לחיצה על קישור במייל */
const redirectUrl = () => `${window.location.origin}${import.meta.env.BASE_URL}`;

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!isCloudConfigured);
  /** המשתמש הגיע דרך קישור שחזור וצריך לקבוע סיסמה חדשה */
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    if (!supabase) return 'הענן אינו מוגדר';
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? translateAuthError(error.message) : null;
  };

  const signUp = async (email: string, password: string) => {
    if (!supabase) return 'הענן אינו מוגדר';
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectUrl() },
    });
    return error ? translateAuthError(error.message) : null;
  };

  /** שולח מייל עם קישור לאיפוס סיסמה */
  const requestPasswordReset = async (email: string) => {
    if (!supabase) return 'הענן אינו מוגדר';
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl(),
    });
    return error ? translateAuthError(error.message) : null;
  };

  /** קובע סיסמה חדשה אחרי כניסה דרך קישור השחזור */
  const setNewPassword = async (password: string) => {
    if (!supabase) return 'הענן אינו מוגדר';
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return translateAuthError(error.message);
    setRecovering(false);
    return null;
  };

  const signOut = async () => {
    await supabase?.auth.signOut();
  };

  return {
    session,
    userId: session?.user.id ?? null,
    email: session?.user.email ?? null,
    ready,
    recovering,
    signIn,
    signUp,
    signOut,
    requestPasswordReset,
    setNewPassword,
  };
}
