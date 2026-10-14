/** אותם שמות כמו ב-public/sw.js, שמקבל את התמונה מהשיתוף ושומר אותה */
const SHARE_CACHE = 'teams-fc-shared-photo';
const SHARED_PHOTO_KEY = 'shared-photo';

/** ה-service worker מפנה לכתובת עם הפרמטר הזה אחרי שקיבל תמונה */
export const SHARED_PHOTO_PARAM = 'shared-photo';

/**
 * התמונה ששותפה לאפליקציה ועוד לא שויכה לשחקן. היא נשארת במטמון עד
 * `clearSharedPhoto` — רענון באמצע (למשל כשגרסה חדשה נטענת) לא מאבד אותה.
 */
export async function readSharedPhoto(): Promise<File | null> {
  if (!('caches' in window)) return null;
  const res = await (await caches.open(SHARE_CACHE)).match(SHARED_PHOTO_KEY);
  if (!res) return null;
  const blob = await res.blob();
  return new File([blob], 'shared', { type: blob.type });
}

/** אחרי שיוך או ויתור — כדי שהתמונה לא תצוץ שוב בפתיחה הבאה */
export async function clearSharedPhoto(): Promise<void> {
  if (!('caches' in window)) return;
  await (await caches.open(SHARE_CACHE)).delete(SHARED_PHOTO_KEY);
}
