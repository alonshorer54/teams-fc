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

/** תרגום שגיאות Supabase הנפוצות להודעות בעברית. */
export function translateAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'אימייל או סיסמה שגויים';
  if (m.includes('user already registered')) return 'כתובת האימייל כבר רשומה — נסו להתחבר';
  if (m.includes('password should be at least')) return 'הסיסמה חייבת להכיל לפחות 6 תווים';
  if (m.includes('unable to validate email') || m.includes('invalid email'))
    return 'כתובת האימייל אינה תקינה';
  if (m.includes('email not confirmed')) return 'צריך לאשר את האימייל לפני ההתחברות';
  if (m.includes('failed to fetch') || m.includes('network'))
    return 'אין חיבור לשרת — בדקו את האינטרנט';
  return message;
}
