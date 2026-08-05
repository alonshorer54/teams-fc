import { useEffect, useMemo, useState } from 'react';
import { Heart, HeartCrack, Link2, Plus, Tag, UserPen, UserPlus, X } from 'lucide-react';
import type { Player } from '../types';
import { Modal } from './ui';

export interface PlayerDraft {
  name: string;
  rating: number;
  friendIds: string[];
  loveIds: string[];
  hateIds: string[];
  tags: string[];
  notes?: string;
}

const clampRating = (n: number) => Math.min(5, Math.max(1, Math.round(n * 10) / 10));

export function PlayerFormModal({
  open,
  editing,
  players,
  knownTags,
  onSave,
  onClose,
}: {
  open: boolean;
  /** null = הוספת שחקן חדש */
  editing: Player | null;
  players: Player[];
  knownTags: string[];
  onSave: (draft: PlayerDraft) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [rating, setRating] = useState(3);
  const [friendIds, setFriendIds] = useState<string[]>([]);
  const [loveIds, setLoveIds] = useState<string[]>([]);
  const [hateIds, setHateIds] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? '');
    setRating(editing?.rating ?? 3);
    setFriendIds(editing?.friendIds ?? []);
    setLoveIds(editing?.loveIds ?? []);
    setHateIds(editing?.hateIds ?? []);
    setTags(editing?.tags ?? []);
    setNotes(editing?.notes ?? '');
    setError(null);
  }, [open, editing]);

  const others = useMemo(
    () => players.filter((p) => p.id !== editing?.id).sort((a, b) => a.name.localeCompare(b.name, 'he')),
    [players, editing],
  );

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('חובה להזין שם שחקן');
      return;
    }
    if (players.some((p) => p.id !== editing?.id && p.name.trim() === trimmed)) {
      setError('כבר קיים שחקן בשם הזה');
      return;
    }
    onSave({
      name: trimmed,
      rating: clampRating(rating),
      friendIds,
      // אי אפשר גם לאהוב וגם לשנוא — השנאה גוברת כי היא ההגבלה החזקה
      loveIds: loveIds.filter((id) => !hateIds.includes(id)),
      hateIds,
      tags,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'עריכת שחקן' : 'הוספת שחקן'}
      icon={
        editing ? (
          <UserPen size={20} className="text-emerald-400" />
        ) : (
          <UserPlus size={20} className="text-emerald-400" />
        )
      }
      maxWidth="max-w-2xl"
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
        </div>

        <PlayerMultiSelect
          label="חברים"
          hint="קשר דו-כיווני — מספיק לרשום פעם אחת, וזה יופיע אצל שניהם. אפשר לבחור כמה שרוצים."
          icon={<Link2 size={13} className="text-emerald-400" />}
          options={others}
          value={friendIds}
          onChange={setFriendIds}
          tone="emerald"
        />

        <PlayerMultiSelect
          label="אוהב לשחק עם"
          hint="העדפה אישית, לא קשורה לחברות. ההגרלה תנסה לחבר ביניהם."
          icon={<Heart size={13} className="text-pink-400" />}
          options={others.filter((p) => !hateIds.includes(p.id))}
          value={loveIds}
          onChange={setLoveIds}
          tone="pink"
        />

        <PlayerMultiSelect
          label="מעדיף לא לשחק עם"
          hint="ההגרלה תנסה להפריד ביניהם."
          icon={<HeartCrack size={13} className="text-rose-400" />}
          options={others.filter((p) => !loveIds.includes(p.id))}
          value={hateIds}
          onChange={setHateIds}
          tone="rose"
        />

        <TagPicker knownTags={knownTags} value={tags} onChange={setTags} />

        <div>
          <label className="label" htmlFor="player-notes">
            הערה חופשית (אופציונלי)
          </label>
          <input
            id="player-notes"
            className="input"
            value={notes}
            placeholder="לדוגמה: חוזר מפציעה"
            onChange={(e) => setNotes(e.target.value)}
          />
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

/* ------------------------- בחירת שחקנים מרובה ------------------------- */

const TONES = {
  emerald: 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200',
  pink: 'border-pink-500/50 bg-pink-500/15 text-pink-200',
  rose: 'border-rose-500/50 bg-rose-500/15 text-rose-200',
} as const;

function PlayerMultiSelect({
  label,
  hint,
  icon,
  options,
  value,
  onChange,
  tone,
}: {
  label: string;
  hint: string;
  icon: React.ReactNode;
  options: Player[];
  value: string[];
  onChange: (next: string[]) => void;
  tone: keyof typeof TONES;
}) {
  const [query, setQuery] = useState('');
  const selected = new Set(value);

  const visible = query.trim()
    ? options.filter((p) => p.name.includes(query.trim()))
    : options;

  return (
    <div>
      <label className="label">
        <span className="inline-flex items-center gap-1.5">
          {icon}
          {label}
          {value.length > 0 && (
            <span className="font-mono text-[10px] text-slate-500">({value.length})</span>
          )}
        </span>
      </label>

      <input
        className="input mb-2 py-1.5 text-xs"
        placeholder="סינון לפי שם..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="max-h-28 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/50 p-2">
        {visible.length === 0 ? (
          <p className="px-1 py-1 text-[11px] text-slate-500">אין שחקנים תואמים</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {visible.map((p) => {
              const on = selected.has(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() =>
                    onChange(on ? value.filter((id) => id !== p.id) : [...value, p.id])
                  }
                  className={`rounded-lg border px-2 py-1 text-[11px] font-semibold transition ${
                    on
                      ? TONES[tone]
                      : 'border-slate-700 bg-slate-800/60 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">{hint}</p>
    </div>
  );
}

/* ------------------------------- תגיות ------------------------------- */

function TagPicker({
  knownTags,
  value,
  onChange,
}: {
  knownTags: string[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [input, setInput] = useState('');

  const add = (tag: string) => {
    const clean = tag.trim();
    if (!clean || value.includes(clean)) return;
    onChange([...value, clean]);
    setInput('');
  };

  const suggestions = knownTags.filter((t) => !value.includes(t));

  return (
    <div>
      <label className="label" htmlFor="player-tags">
        <span className="inline-flex items-center gap-1.5">
          <Tag size={13} className="text-amber-400" />
          תגיות
        </span>
      </label>

      {value.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/15 px-2 py-1 text-[11px] font-semibold text-amber-200"
            >
              {tag}
              <button
                type="button"
                onClick={() => onChange(value.filter((t) => t !== tag))}
                aria-label={`הסרת התגית ${tag}`}
                className="text-amber-300/70 transition hover:text-white"
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          id="player-tags"
          className="input py-1.5 text-xs"
          placeholder="לדוגמה: לא בכושר, רץ הרבה, נלחם"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add(input);
            }
          }}
        />
        <button type="button" className="btn-ghost !px-3 !py-1.5" onClick={() => add(input)}>
          <Plus size={14} />
        </button>
      </div>

      {suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {suggestions.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => add(tag)}
              className="rounded-lg border border-slate-700 bg-slate-800/60 px-2 py-0.5 text-[11px] text-slate-300 transition hover:border-amber-500/40 hover:text-amber-200"
            >
              + {tag}
            </button>
          ))}
        </div>
      )}

      <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
        ההגרלה מפזרת שווה בין הקבוצות שחקנים עם אותה תגית — כך שלא כל מי שלא בכושר ייפול לאותה קבוצה.
      </p>
    </div>
  );
}
