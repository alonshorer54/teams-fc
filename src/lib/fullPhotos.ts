import { supabase } from './supabase';

/**
 * התמונה המלאה של שחקן — מה שרואים כשלוחצים על העיגול. היא גדולה פי ~10 מהעיגול,
 * ולכן לא יושבת במסמך השחקנים שמסתנכרן בכל שינוי: יש לה טבלה משלה בענן
 * (supabase-photos.sql), והיא נטענת רק כשפותחים אותה.
 *
 * במצב דוגמה או מקומי אין ענן — התמונה נשמרת רק בזיכרון של הדף.
 */
const TABLE = 'kohot_photos';
const PHOTO_RE = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/;
export const MAX_FULL_PHOTO_LENGTH = 300_000;

/**
 * full: null = בדקנו, ואין תמונה מלאה. small = העיגול שהיה כשנטענה: כשהתמונה
 * מוחלפת (גם ממכשיר אחר) העיגול משתנה, והתמונה המלאה נטענת מחדש
 */
const cache = new Map<string, { small: string | undefined; full: string | null }>();
const key = (ownerId: string | null, playerId: string) => `${ownerId ?? 'local'}/${playerId}`;

export async function loadFullPhoto(
  ownerId: string | null,
  playerId: string,
  small: string | undefined,
): Promise<string | null> {
  const k = key(ownerId, playerId);
  const hit = cache.get(k);
  if (hit && hit.small === small) return hit.full;
  if (!supabase || !ownerId) return hit?.full ?? null;

  const { data, error } = await supabase
    .from(TABLE)
    .select('photo')
    .eq('owner_id', ownerId)
    .eq('player_id', playerId)
    .maybeSingle();
  // טבלה שעוד לא נוצרה, או אין רשת — פשוט נשארים עם העיגול, בלי לזכור את הכישלון
  if (error) return null;
  const photo = typeof data?.photo === 'string' && PHOTO_RE.test(data.photo) ? data.photo : null;
  cache.set(k, { small, full: photo });
  return photo;
}

/** מחזיר false כשהשמירה בענן נכשלה (למשל כשהטבלה עוד לא נוצרה) */
export async function saveFullPhoto(
  ownerId: string | null,
  playerId: string,
  photo: string,
  small: string,
): Promise<boolean> {
  cache.set(key(ownerId, playerId), { small, full: photo });
  if (!supabase || !ownerId) return true;
  const { error } = await supabase
    .from(TABLE)
    .upsert({ owner_id: ownerId, player_id: playerId, photo, updated_at: new Date().toISOString() });
  return !error;
}

export async function deleteFullPhoto(ownerId: string | null, playerId: string): Promise<void> {
  cache.set(key(ownerId, playerId), { small: undefined, full: null });
  if (!supabase || !ownerId) return;
  await supabase.from(TABLE).delete().eq('owner_id', ownerId).eq('player_id', playerId);
}
