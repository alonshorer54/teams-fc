import { useEffect, useRef, useState } from 'react';
import { Camera, Crop as CropIcon, X } from 'lucide-react';
import { defaultCrop, encodeFull, encodePhoto, loadPhoto, type Crop } from '../lib/photo';
import { isPlayerPhoto } from '../types';
import { Avatar, Modal, PhotoViewer } from './ui';
import { PhotoCropper } from './PhotoCropper';

/**
 * לחיצה על העיגול פותחת את הגלריה. אין דרך בטוחה למשוך תמונת פרופיל מוואטסאפ
 * ישירות, והטלפון חוסם צילום מסך שלה — שומרים אותה מוואטסאפ ווב במחשב.
 */
export function PhotoPicker({
  name,
  photo,
  onChange,
  size = 46,
  removable = true,
  viewFirst = false,
  playerId,
}: {
  name: string;
  photo: string | undefined;
  /** next = העיגול החתוך; full = התמונה המלאה להגדלה (רק כשנבחרה תמונה חדשה) */
  onChange: (next: string | undefined, full?: string) => void;
  /** כדי שההגדלה תטען את התמונה המלאה של השחקן הזה */
  playerId?: string;
  size?: number;
  /** ברשימת השחקנים אין כפתור הסרה: לחיצה מקרית הייתה מוחקת תמונה בלי ביטול */
  removable?: boolean;
  /** לחיצה על תמונה קיימת מגדילה אותה (כמו בוואטסאפ), וההחלפה היא כפתור בחלון */
  viewFirst?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  // השגיאה מוצגת ליד התמונה: בתחתית הטופס הארוך היא נופלת מחוץ למסך בטלפון
  const [error, setError] = useState<string | null>(null);
  /** התמונה שנבחרה, בזמן שמכוונים איזה חלק ממנה נכנס לעיגול */
  const [editing, setEditing] = useState<{ source: HTMLCanvasElement; crop: Crop } | null>(null);
  const [viewing, setViewing] = useState(false);
  // המודאל נסגר באמצע העיבוד? התוצאה לא שייכת לאף טופס — אחרת היא נוחתת על
  // השחקן הבא שנפתח
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  // ברשימת השחקנים ההודעה מכסה את הכרטיס הבא — היא נעלמת לבד
  useEffect(() => {
    if (!error) return;
    const t = window.setTimeout(() => setError(null), 4000);
    return () => window.clearTimeout(t);
  }, [error]);

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() =>
          viewFirst && isPlayerPhoto(photo) ? setViewing(true) : inputRef.current?.click()
        }
        disabled={busy}
        className="group relative block rounded-full"
        title={
          viewFirst && photo
            ? 'הגדלת התמונה'
            : 'בחירת תמונה מהגלריה — למשל תמונת הפרופיל שלו מוואטסאפ ווב'
        }
        aria-label={viewFirst && photo ? 'הגדלת התמונה' : photo ? 'החלפת התמונה' : 'הוספת תמונה'}
      >
        <Avatar name={name || '?'} photo={photo} size={size} />
        {/* ברשימה המצלמה רק אצל מי שעוד אין לו תמונה — עשרים מצלמות ירוקות היו רק רעש */}
        {(removable || !photo) && (
          <span className="absolute -end-0.5 -bottom-0.5 rounded-full border border-slate-900 bg-emerald-500 p-1 text-emerald-950 transition group-hover:scale-110">
            <Camera size={11} />
          </span>
        )}
      </button>

      {photo && removable && (
        <button
          type="button"
          onClick={() => {
            onChange(undefined);
            setError(null);
          }}
          className="absolute -start-1 -top-1 rounded-full border border-slate-900 bg-slate-700 p-0.5 text-slate-200 transition hover:bg-rose-500"
          title="הסרת התמונה"
          aria-label="הסרת התמונה"
        >
          <X size={10} />
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          // מאפסים כדי שבחירה חוזרת באותו קובץ תפעיל שוב את האירוע
          e.target.value = '';
          if (!file) return;
          setBusy(true);
          setError(null);
          try {
            const source = await loadPhoto(file);
            if (alive.current) setEditing({ source, crop: defaultCrop(source) });
          } catch (err) {
            if (alive.current)
              setError(err instanceof Error ? err.message : 'לא הצלחנו לטעון את התמונה');
          } finally {
            if (alive.current) setBusy(false);
          }
        }}
      />

      <PhotoViewer
        name={name}
        playerId={playerId}
        photo={viewing ? photo : undefined}
        onClose={() => setViewing(false)}
        action={
          <button
            className="btn-ghost w-full"
            onClick={() => {
              setViewing(false);
              inputRef.current?.click();
            }}
          >
            <Camera size={15} />
            החלפת תמונה
          </button>
        }
      />

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={name ? `התמונה של ${name}` : 'התמונה של השחקן'}
        icon={<CropIcon size={20} className="text-emerald-400" />}
        maxWidth="max-w-sm"
      >
        {editing && (
          <div className="space-y-4">
            <PhotoCropper
              source={editing.source}
              crop={editing.crop}
              onChange={(crop) => setEditing({ ...editing, crop })}
            />
            <div className="flex gap-2">
              <button
                className="btn-primary flex-1"
                onClick={() => {
                  try {
                    onChange(encodePhoto(editing.source, editing.crop), encodeFull(editing.source));
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'לא הצלחנו לשמור את התמונה');
                  }
                  setEditing(null);
                }}
              >
                שמירה
              </button>
              <button className="btn-ghost" onClick={() => setEditing(null)}>
                ביטול
              </button>
            </div>
          </div>
        )}
      </Modal>

      {error && (
        <p className="absolute start-0 top-full z-10 mt-1 w-56 rounded-lg border border-rose-500/40 bg-slate-900 px-2 py-1 text-[11px] font-semibold text-rose-300">
          {error}
        </p>
      )}
    </div>
  );
}
