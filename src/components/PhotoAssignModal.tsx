import { useMemo, useState } from 'react';
import { ImageDown, SkipForward } from 'lucide-react';
import type { Player } from '../types';
import { Avatar, Modal } from './ui';

/**
 * עובר על תמונות אחת אחרי השנייה ושואל של מי כל אחת. לחיצה על שחקן שומרת
 * ועוברת לבאה; "דילוג" עובר בלי לשמור. הרשימה לפי א"ב ולא "בלי תמונה קודם":
 * רשימה שמשתנה אחרי כל לחיצה מזיזה את השם מתחת לאצבע.
 */
export function PhotoAssignModal({
  photos,
  players,
  canEdit = true,
  onAssign,
  onDone,
}: {
  /** ריק = החלון סגור */
  photos: string[];
  players: Player[];
  /** עוזרים לא יכולים לשנות שחקנים קיימים — המסד ידחה את השמירה */
  canEdit?: boolean;
  onAssign: (id: string, photo: string) => void;
  /** נקרא כשהתמונות נגמרו, או כשסוגרים באמצע — עם מספר התמונות שלא טופלו */
  onDone: (remaining: number) => void;
}) {
  const [index, setIndex] = useState(0);
  const [query, setQuery] = useState('');
  // סדרה חדשה מתחילה מההתחלה, גם אם הקודמת לא נסגרה כמו שצריך. משווים תוכן
  // ולא מערך: מי שמעביר [photo] בונה מערך חדש בכל רינדור, וזו הייתה לולאה
  const [batch, setBatch] = useState(photos);
  if (batch.length !== photos.length || batch.some((p, i) => p !== photos[i])) {
    setBatch(photos);
    setIndex(0);
  }
  const photo = photos[index];

  const visible = useMemo(() => {
    const q = query.trim();
    return players
      .filter((p) => !q || p.name.includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, 'he'));
  }, [players, query]);

  const finish = (remaining: number) => {
    setIndex(0);
    setQuery('');
    onDone(remaining);
  };

  const next = () => {
    setQuery('');
    if (index + 1 < photos.length) setIndex(index + 1);
    else finish(0);
  };

  return (
    <Modal
      open={!!photo}
      onClose={() => finish(photos.length - index)}
      title={
        photos.length > 1 ? `של מי התמונה? (${index + 1} מתוך ${photos.length})` : 'של מי התמונה?'
      }
      icon={<ImageDown size={20} className="text-emerald-400" />}
    >
      {photo && (
        <div className="space-y-3">
          <div className="flex items-center justify-center gap-3">
            <Avatar name="?" photo={photo} size={72} />
            {photos.length > 1 && (
              <button className="btn-ghost !py-1.5 text-xs" onClick={next}>
                <SkipForward size={13} />
                דילוג
              </button>
            )}
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
                        next();
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
