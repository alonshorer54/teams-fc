/*
 * Service worker מינימלי: מאפשר התקנה כאפליקציה, ומגיש את המעטפת מהמטמון
 * כשאין רשת. הנתונים עצמם ממילא מגיעים מ-localStorage ומ-Supabase.
 */
// __BUILD_ID__ מוחלף בזמן הבנייה. כך כל גרסה מקבלת מטמון משלה,
// והמטמון של הגרסה הקודמת נמחק — בלי להתקין מחדש ובלי לצבור זבל.
const CACHE = 'teams-fc-__BUILD_ID__';

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
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
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
        .catch(() => caches.match(request).then((r) => r || caches.match('./index.html'))),
    );
    return;
  }

  // נכסים: קודם מטמון, ומעדכנים ברקע
  event.respondWith(
    caches.match(request).then(
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
