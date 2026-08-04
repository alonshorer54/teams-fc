import { useEffect, useState } from 'react';
import { Link2, UserPlus, UserPen } from 'lucide-react';
import type { Player } from '../types';
import { Modal } from './ui';

export interface PlayerDraft {
  name: string;
  rating: number;
  friendOf: string | null;
}

const clampRating = (n: number) => Math.min(5, Math.max(1, Math.round(n * 10) / 10));

export function PlayerFormModal({
  open,
  editing,
  players,
  onSave,
  onClose,
}: {
  open: boolean;
  /** null = הוספת שחקן חדש */
  editing: Player | null;
  players: Player[];
  onSave: (draft: PlayerDraft) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [rating, setRating] = useState(3);
  const [friendOf, setFriendOf] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? '');
    setRating(editing?.rating ?? 3);
    setFriendOf(editing?.friendOf ?? '');
    setError(null);
  }, [open, editing]);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('חובה להזין שם שחקן');
      return;
    }
    const duplicate = players.some(
      (p) => p.id !== editing?.id && p.name.trim() === trimmed,
    );
    if (duplicate) {
      setError('כבר קיים שחקן בשם הזה');
      return;
    }
    onSave({ name: trimmed, rating: clampRating(rating), friendOf: friendOf || null });
  };

  // שחקן לא יכול להיות "חבר של" עצמו
  const friendOptions = players.filter((p) => p.id !== editing?.id);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'עריכת שחקן' : 'הוספת שחקן'}
      icon={editing ? <UserPen size={20} className="text-emerald-400" /> : <UserPlus size={20} className="text-emerald-400" />}
    >
      <div className="space-y-5">
        <div>
          <label className="label" htmlFor="player-name">
            שם השחקן
          </label>
          <input
            id="player-name"
            className="input"
            value={name}
            autoFocus
            placeholder="לדוגמה: יוסי כהן"
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </div>

        <div>
          <label className="label" htmlFor="player-rating">
            דירוג (1.0 – 5.0)
          </label>
          <div className="flex items-center gap-3">
            <input
              id="player-rating"
              type="range"
              min={1}
              max={5}
              step={0.1}
              value={rating}
              onChange={(e) => setRating(Number(e.target.value))}
              className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-slate-700 accent-emerald-500"
            />
            <input
              type="number"
              min={1}
              max={5}
              step={0.1}
              value={rating}
              onChange={(e) => setRating(clampRating(Number(e.target.value) || 1))}
              className="input w-24 text-center font-mono font-bold"
            />
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-slate-500">
            <span>מתחיל</span>
            <span>בינוני</span>
            <span>מצוין</span>
          </div>
        </div>

        <div>
          <label className="label" htmlFor="player-friend">
            <span className="inline-flex items-center gap-1.5">
              <Link2 size={13} />
              הגיע דרך / חבר של (אופציונלי)
            </span>
          </label>
          <select
            id="player-friend"
            className="input"
            value={friendOf}
            onChange={(e) => setFriendOf(e.target.value)}
          >
            <option value="">— ללא —</option>
            {friendOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
            שחקנים מקושרים ישובצו לאותה קבוצה כשהאיזון מאפשר זאת.
          </p>
        </div>

        {error && (
          <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-300">
            {error}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button className="btn-primary flex-1" onClick={submit}>
            {editing ? 'שמירת שינויים' : 'הוספה למאגר'}
          </button>
          <button className="btn-ghost" onClick={onClose}>
            ביטול
          </button>
        </div>
      </div>
    </Modal>
  );
}
