import { useMemo, useRef, useState } from 'react';
import {
  ArrowDownUp,
  Images,
  Link2,
  Pencil,
  Search,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { POSITIONS, POSITION_META, type Player } from '../types';
import { ConfirmDialog, EmptyState, PositionChip, RatingBadge } from './ui';
import { PlayerFormModal, type PlayerDraft } from './PlayerFormModal';
import { PhotoPicker } from './PhotoPicker';
import { PhotoAssignModal } from './PhotoAssignModal';
import { photoFromFile } from '../lib/photo';

type SortKey = 'name' | 'rating';

export function PlayersView({
  players,
  onCreate,
  onUpdate,
  onDelete,
  onSetPhoto,
  notify,
}: {
  players: Player[];
  onCreate: (draft: PlayerDraft) => void;
  onUpdate: (id: string, draft: PlayerDraft) => void;
  onDelete: (id: string) => void;
  /** לחיצה על העיגול ברשימה — תמונה בלי לפתוח את טופס העריכה */
  onSetPhoto: (id: string, photo: string) => void;
  notify: (msg: string) => void;
}) {
  const [query, setQuery] = useState('');
  // ברירת מחדל לפי א"ב — הכי נוח למצוא שחקן מסוים
  const [sortKey, setSortKey] = useState<SortKey>('rating');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Player | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Player | null>(null);

  const nameById = useMemo(() => new Map(players.map((p) => [p.id, p.name])), [players]);

  const visible = useMemo(() => {
    const q = query.trim();
    const filtered = q ? players.filter((p) => p.name.includes(q)) : players;
    return [...filtered].sort((a, b) =>
      sortKey === 'rating'
        ? b.rating - a.rating || a.name.localeCompare(b.name, 'he')
        : a.name.localeCompare(b.name, 'he'),
    );
  }, [players, query, sortKey]);

  const avg = players.length
    ? players.reduce((s, p) => s + p.rating, 0) / players.length
    : 0;

  return (
    <div className="space-y-4">
      {/* סרגל פעולות */}
      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={16} className="absolute top-1/2 right-3 -translate-y-1/2 text-slate-500" />
          <input
            className="input pr-9"
            placeholder="חיפוש שחקן..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {/* הכפתור מתאר את המצב הנוכחי, לא את הפעולה — "לפי דירוג" לבדו היה
            יכול להיקרא גם כהבטחה למה שיקרה בלחיצה */}
        <button
          className="btn-ghost"
          onClick={() => setSortKey(sortKey === 'rating' ? 'name' : 'rating')}
          title={
            sortKey === 'rating'
              ? 'הרשימה מסודרת לפי דירוג — לחיצה תסדר לפי שם'
              : 'הרשימה מסודרת לפי שם — לחיצה תסדר לפי דירוג'
          }
        >
          <ArrowDownUp size={16} />
          {sortKey === 'rating' ? 'מסודר לפי דירוג' : 'מסודר לפי שם'}
        </button>

        <BulkPhotosButton players={players} onAssign={onSetPhoto} notify={notify} />

        <button
          className="btn-primary"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <UserPlus size={16} />
          שחקן חדש
        </button>
      </div>

      {/* סיכום מאגר */}
      {players.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="שחקנים במאגר" value={String(players.length)} />
          <Stat label="דירוג ממוצע" value={avg.toFixed(2)} />
          <PositionStats players={players} />
        </div>
      )}

      {/* רשימה */}
      {visible.length === 0 ? (
        <EmptyState
          icon={<Users size={28} />}
          title={players.length ? 'לא נמצאו שחקנים תואמים' : 'המאגר ריק'}
          hint={
            players.length
              ? 'נסו לשנות את מונח החיפוש.'
              : 'הוסיפו את השחקנים הקבועים שלכם — שם, דירוג, ומי חבר של מי.'
          }
          action={
            !players.length ? (
              <button
                className="btn-primary mt-2"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                <UserPlus size={16} />
                הוספת שחקן ראשון
              </button>
            ) : undefined
          }
        />
      ) : (
        <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((p) => {
            const names = (ids: string[]) =>
              ids.map((id) => nameById.get(id)).filter(Boolean).join(', ');

            return (
              <li
                key={p.id}
                className="card flex items-start gap-3 p-3.5 transition hover:border-slate-700"
              >
                <PhotoPicker
                  name={p.name}
                  photo={p.photo}
                  size={40}
                  removable={false}
                  onChange={(next) => next && onSetPhoto(p.id, next)}
                />

                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="flex items-center gap-1.5 truncate font-semibold text-slate-100">
                    <span className="truncate">{p.name}</span>
                    <PositionChip positions={p.positions} />
                    {p.isManager && (
                      <ShieldCheck size={13} className="shrink-0 text-amber-400" aria-label="מנהל קבוצה" />
                    )}
                  </p>

                  {p.friendIds.length > 0 && (
                    <p className="flex items-center gap-1 truncate text-[11px] text-slate-400">
                      <Link2 size={11} className="shrink-0 text-emerald-400/80" />
                      <span className="truncate">חבר של {names(p.friendIds)}</span>
                    </p>
                  )}
                  {p.loveIds.length > 0 && (
                    <p className="flex items-center gap-1 truncate text-[11px] text-slate-400">
                      <ThumbsUp size={11} className="shrink-0 text-sky-400/80" />
                      <span className="truncate">מעדיף עם {names(p.loveIds)}</span>
                    </p>
                  )}
                  {p.hateIds.length > 0 && (
                    <p className="flex items-center gap-1 truncate text-[11px] text-slate-400">
                      <ThumbsDown size={11} className="shrink-0 text-rose-400/80" />
                      <span className="truncate">מעדיף בלי {names(p.hateIds)}</span>
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <RatingBadge rating={p.rating} />
                  <button
                    className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-emerald-300"
                    title="עריכה"
                    onClick={() => {
                      setEditing(p);
                      setFormOpen(true);
                    }}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-500/15 hover:text-rose-300"
                    title="מחיקה"
                    onClick={() => setPendingDelete(p)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <PlayerFormModal
        open={formOpen}
        editing={editing}
        players={players}
        onClose={() => setFormOpen(false)}
        onSave={(draft) => {
          if (editing) onUpdate(editing.id, draft);
          else onCreate(draft);
          setFormOpen(false);
        }}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        title="מחיקת שחקן"
        message={
          <>
            למחוק את <b className="text-slate-100">{pendingDelete?.name}</b> מהמאגר? הוא יישאר בערבים
            שכבר נשמרו, אבל לא בסטטיסטיקות ובמגמות.
          </>
        }
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) onDelete(pendingDelete.id);
          setPendingDelete(null);
        }}
      />
    </div>
  );
}

/** כמה שחקנים בכל עמדה. מי שרשום על כמה עמדות נספר בכל אחת, אז הסכום יכול לעבור את המאגר */
function PositionStats({ players }: { players: Player[] }) {
  return (
    <div className="card col-span-2 grid grid-cols-5 px-2 py-3 text-center">
      {POSITIONS.map((pos) => (
        <div key={pos} title={`כמה שחקנים רשומים ב${POSITION_META[pos].label}`}>
          <p className="font-mono text-xl font-bold text-emerald-300 tabular-nums">
            {players.filter((p) => p.positions.includes(pos)).length}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            {POSITION_META[pos].emoji} {POSITION_META[pos].label}
          </p>
        </div>
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-4 py-3 text-center">
      <p className="font-mono text-xl font-bold text-emerald-300 tabular-nums">{value}</p>
      <p className="mt-0.5 text-[11px] text-slate-400">{label}</p>
    </div>
  );
}

/* ------------------------- הוספת כמה תמונות ------------------------- */

/**
 * בוחרים כמה תמונות בבת אחת (למשל תמונות פרופיל ששמרתם מוואטסאפ ווב), ואז
 * לכל אחת לוחצים על השחקן שלה.
 */
function BulkPhotosButton({
  players,
  onAssign,
  notify,
}: {
  players: Player[];
  onAssign: (id: string, photo: string) => void;
  notify: (msg: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [queue, setQueue] = useState<string[]>([]);

  return (
    <>
      <button
        className="btn-ghost"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        title="בחירת כמה תמונות בבת אחת, ושיוך כל אחת לשחקן שלה"
      >
        <Images size={16} />
        {busy ? 'טוען תמונות...' : 'הוספת תמונות'}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={async (e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          if (!files.length) return;
          setBusy(true);
          const photos: string[] = [];
          for (const file of files) {
            try {
              photos.push(await photoFromFile(file));
            } catch {
              // תמונה שלא נקראת פשוט לא נכנסת לתור — מדווחים כמה בסוף
            }
          }
          setBusy(false);
          const failed = files.length - photos.length;
          if (failed) notify(failed === 1 ? 'תמונה אחת לא נקראה ודולגה' : `${failed} תמונות לא נקראו ודולגו`);
          setQueue(photos);
        }}
      />

      <PhotoAssignModal
        photos={queue}
        players={players}
        onAssign={onAssign}
        onDone={(remaining) => {
          setQueue([]);
          if (remaining)
            notify(remaining === 1 ? 'תמונה אחת לא שויכה' : `${remaining} תמונות לא שויכו`);
        }}
      />
    </>
  );
}
