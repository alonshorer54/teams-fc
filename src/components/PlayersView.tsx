import { useMemo, useState } from 'react';
import {
  ArrowDownUp,
  Link2,
  Pencil,
  Search,
  ShieldCheck,
  Tag,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { collectTags, type Player } from '../types';
import { ConfirmDialog, EmptyState, RatingBadge } from './ui';
import { PlayerFormModal, type PlayerDraft } from './PlayerFormModal';

type SortKey = 'name' | 'rating';

export function PlayersView({
  players,
  onCreate,
  onUpdate,
  onDelete,
}: {
  players: Player[];
  onCreate: (draft: PlayerDraft) => void;
  onUpdate: (id: string, draft: PlayerDraft) => void;
  onDelete: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  // ברירת מחדל לפי א"ב — הכי נוח למצוא שחקן מסוים
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Player | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Player | null>(null);

  const nameById = useMemo(() => new Map(players.map((p) => [p.id, p.name])), [players]);
  const knownTags = useMemo(() => collectTags(players), [players]);

  const visible = useMemo(() => {
    const q = query.trim();
    const filtered = q ? players.filter((p) => p.name.includes(q)) : players;
    return [...filtered].sort((a, b) =>
      sortKey === 'rating' ? b.rating - a.rating : a.name.localeCompare(b.name, 'he'),
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

        <button
          className="btn-ghost"
          onClick={() => setSortKey(sortKey === 'rating' ? 'name' : 'rating')}
          title="החלפת סדר מיון"
        >
          <ArrowDownUp size={16} />
          {sortKey === 'rating' ? 'לפי דירוג' : 'לפי שם'}
        </button>

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
        <div className="grid grid-cols-3 gap-3">
          <Stat label="שחקנים במאגר" value={String(players.length)} />
          <Stat label="דירוג ממוצע" value={avg.toFixed(2)} />
          <Stat
            label="קשרי חברות"
            value={String(players.reduce((s, p) => s + p.friendIds.length, 0) / 2)}
          />
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
                <div className="pt-0.5">
                  <RatingBadge rating={p.rating} />
                </div>

                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="flex items-center gap-1.5 truncate font-semibold text-slate-100">
                    <span className="truncate">{p.name}</span>
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
                  {p.tags.length > 0 && (
                    <p className="flex flex-wrap items-center gap-1 pt-0.5">
                      <Tag size={11} className="shrink-0 text-amber-400/80" />
                      {p.tags.map((tag) => (
                        <span
                          key={tag}
                          className="max-w-full rounded bg-amber-500/15 px-1.5 text-[10px] font-semibold break-words text-amber-200"
                        >
                          {tag}
                        </span>
                      ))}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 gap-1">
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
        knownTags={knownTags}
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
            למחוק את <b className="text-slate-100">{pendingDelete?.name}</b> מהמאגר? הגרלות שנשמרו
            בהיסטוריה יישארו כפי שהן.
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-4 py-3 text-center">
      <p className="font-mono text-xl font-bold text-emerald-300 tabular-nums">{value}</p>
      <p className="mt-0.5 text-[11px] text-slate-400">{label}</p>
    </div>
  );
}
