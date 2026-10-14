import { useEffect, useMemo, useRef, useState } from 'react';
import { ImageDown } from 'lucide-react';
import type { Player } from '../types';
import { photoFromFile } from '../lib/photo';
import { SHARED_PHOTO_PARAM, clearSharedPhoto, readSharedPhoto } from '../lib/sharedPhoto';
import { Avatar, Modal } from './ui';

/**
 * נפתח כשמשתפים תמונה לאפליקציה — למשל תמונת פרופיל מוואטסאפ ← שיתוף ← Teams FC —
 * ושואל של איזה שחקן היא. לחיצה על שחקן שומרת, והחלון נסגר.
 */
export function SharedPhotoModal({
  players,
  canEdit,
  onAssign,
  notify,
}: {
  players: Player[];
  /** עוזרים לא יכולים לשנות שחקנים קיימים — המסד ידחה את השמירה */
  canEdit: boolean;
  onAssign: (id: string, photo: string) => void;
  notify: (msg: string) => void;
}) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  // במצב פיתוח React מריץ אפקט פעמיים — בלי זה הפרמטר נמחק בריצה הראשונה,
  // והשנייה הייתה מודיעה שהתמונה "לא הגיעה"
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const url = new URL(window.location.href);
    const arrivedNow = url.searchParams.has(SHARED_PHOTO_PARAM);
    if (arrivedNow) {
      url.searchParams.delete(SHARED_PHOTO_PARAM);
      window.history.replaceState(null, '', url);
    }

    // בודקים את המטמון גם בלי הפרמטר: שיתוף שנחת על מסך הכניסה מאבד אותו
    // בחזרה מגוגל, והתמונה עדיין מחכה
    void (async () => {
      try {
        const file = await readSharedPhoto();
        if (!file) {
          if (arrivedNow) notify('התמונה ששותפה לא הגיעה — נסו לשתף שוב');
          return;
        }
        setPhoto(await photoFromFile(file));
      } catch (err) {
        // תמונה שלא נקראת לא תיקרא גם בפעם הבאה
        void clearSharedPhoto();
        notify(err instanceof Error ? err.message : 'לא הצלחנו לטעון את התמונה');
      }
    })();
  }, [notify]);

  const visible = useMemo(() => {
    const q = query.trim();
    return players
      .filter((p) => !q || p.name.includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, 'he'));
  }, [players, query]);

  const close = () => {
    setPhoto(null);
    setQuery('');
    void clearSharedPhoto();
  };

  return (
    <Modal
      open={!!photo}
      onClose={close}
      title="של מי התמונה?"
      icon={<ImageDown size={20} className="text-emerald-400" />}
    >
      {photo && (
        <div className="space-y-3">
          <div className="flex justify-center">
            <Avatar name="?" photo={photo} size={72} />
          </div>

          {!canEdit ? (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              רק בעל המאגר יכול להוסיף תמונות לשחקנים.
            </p>
          ) : (
            <>
              <input
                className="input py-1.5 text-sm"
                placeholder="חיפוש שחקן..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <ul className="grid max-h-[50vh] grid-cols-2 gap-1.5 overflow-y-auto overscroll-contain">
                {visible.map((p) => (
                  <li key={p.id}>
                    <button
                      className="flex w-full items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/50 px-2 py-1.5 text-start text-sm font-semibold text-slate-100 transition hover:border-emerald-500/50"
                      onClick={() => {
                        onAssign(p.id, photo);
                        close();
                      }}
                    >
                      <Avatar name={p.name} photo={p.photo} size={28} />
                      <span className="truncate">{p.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
