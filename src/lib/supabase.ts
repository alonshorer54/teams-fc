import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * האם הענן מוגדר. אם לא — האפליקציה עובדת במצב מקומי בלבד (localStorage),
 * בדיוק כמו קודם, כדי שאפשר יהיה להשתמש בה עוד לפני שמחברים חשבון.
 */
export const isCloudConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isCloudConfigured
  ? createClient(url!, anonKey!, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;

/** שם הטבלה שמחזיקה את מסמך הנתונים של כל משתמש. */
export const TABLE = 'kohot_data';

/** Sign-in errors the user can act on, in Hebrew. Sign-in is Google-only. */
export function translateAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('provider is not enabled')) return 'הכניסה עם גוגל לא מופעלת בשרת';
  if (m.includes('failed to fetch') || m.includes('network'))
    return 'אין חיבור לשרת — בדקו את האינטרנט';
  return message;
}
