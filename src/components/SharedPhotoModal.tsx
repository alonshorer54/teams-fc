import { useEffect, useRef, useState } from 'react';
import type { Player } from '../types';
import { loadPhoto } from '../lib/photo';
import { SHARED_PHOTO_PARAM, clearSharedPhoto, readSharedPhoto } from '../lib/sharedPhoto';
import { PhotoAssignModal } from './PhotoAssignModal';

/**
 * נפתח כשמשתפים תמונה לאפליקציה מהגלריה (שיתוף ← Teams FC, באנדרואיד) ושואל
 * של איזה שחקן היא. וואטסאפ עצמו לא משתף תמונות פרופיל החוצה.
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
  const [photo, setPhoto] = useState<HTMLCanvasElement | null>(null);
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
        setPhoto(await loadPhoto(file));
      } catch (err) {
        // תמונה שלא נקראת לא תיקרא גם בפעם הבאה
        void clearSharedPhoto();
        notify(err instanceof Error ? err.message : 'לא הצלחנו לטעון את התמונה');
      }
    })();
  }, [notify]);

  return (
    <PhotoAssignModal
      photos={photo ? [photo] : []}
      players={players}
      canEdit={canEdit}
      onAssign={onAssign}
      onDone={() => {
        setPhoto(null);
        void clearSharedPhoto();
      }}
    />
  );
}
