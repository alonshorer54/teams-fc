/*
 * Service worker מינימלי: מאפשר התקנה כאפליקציה, ומגיש את המעטפת מהמטמון
 * כשאין רשת. הנתונים עצמם ממילא מגיעים מ-localStorage ומ-Supabase.
 */
// __BUILD_ID__ מוחלף בזמן הבנייה. כך כל גרסה מקבלת מטמון משלה,
// והמטמון של הגרסה הקודמת נמחק — בלי להתקין מחדש ובלי לצבור זבל.
const CACHE = 'teams-fc-__BUILD_ID__';

// תמונה ששותפה מאפליקציה אחרת (הגלריה) מחכה כאן עד שהאפליקציה נפתחת ושואלת
// של מי היא. השמות חייבים להתאים ל-src/lib/sharedPhoto.ts
const SHARE_CACHE = 'teams-fc-shared-photo';
const SHARED_PHOTO_KEY = 'shared-photo';
const SHARE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(['./', './index.html']).catch(() => {})),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE && k !== SHARE_CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // "שיתוף" של תמונה אל האפליקציה: אנדרואיד שולח אותה כטופס POST. אין שרת שיקבל
  // אותו, אז ה-service worker שומר את הקובץ ומפנה לאפליקציה עצמה
  const shareUrl = new URL('./share-photo', self.registration.scope).href;
  if (request.method === 'POST' && request.url === shareUrl) {
    event.respondWith(
      (async () => {
        try {
          const file = (await request.formData()).get('photo');
          // רק תמונות רגילות — לא SVG, שהוא מסמך עם קוד ולא סתם תמונה
          if (file instanceof File && SHARE_TYPES.includes(file.type)) {
            const cache = await caches.open(SHARE_CACHE);
            await cache.put(
              SHARED_PHOTO_KEY,
              new Response(file, { headers: { 'Content-Type': file.type } }),
            );
          }
        } catch {
          // האפליקציה תגיד שהתמונה לא הגיעה
        }
        return Response.redirect(new URL('./?shared-photo', self.registration.scope).href, 303);
      })(),
    );
    return;
  }

  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  // ניווט: קודם רשת (כדי לקבל גרסה חדשה), ואם אין — מהמטמון
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() =>
          // רק מהמטמון של הגרסה — לעולם לא קובץ ששותף מבחוץ
          caches
            .open(CACHE)
            .then((c) => c.match(request).then((r) => r || c.match('./index.html'))),
        ),
    );
    return;
  }

  // נכסים: קודם מטמון, ומעדכנים ברקע
  event.respondWith(
    caches.open(CACHE).then((c) => c.match(request)).then(
      (cached) =>
        cached ||
        fetch(request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
          return res;
        }),
    ),
  );
});
