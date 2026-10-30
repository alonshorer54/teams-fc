import { useMemo, useState } from 'react';
import { CalendarDays, Copy, Image as ImageIcon, Share2 } from 'lucide-react';
import { TEAM_META, teamGridClass, teamsIn } from '../types';
import {
  buildWhatsAppFormationText,
  buildWhatsAppText,
  copyToClipboard,
  formatHebrewDate,
  type ShareFormation,
  type ShareFormations,
  type ShareTeams,
} from '../lib/format';
import type { FieldPosition } from '../lib/formation';
import { canShareImage, downloadImage, renderTeamsImage, shareImage } from '../lib/shareImage';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { Avatar } from './ui';
import { PitchField, RotatingGoal } from './PitchField';

type ShareLayout = 'list' | 'formation';

/**
 * "מצב וואטסאפ" — תצוגה נקייה לחלוטין: שמות קבוצות ושמות שחקנים בלבד.
 * ללא דירוגים, ללא ממוצעים וללא סימוני כימיה. אפשר לשלוח כרשימה או לפי המערך.
 */
export function ShareView({
  teams,
  formations,
  date,
  onCopied,
}: {
  teams: ShareTeams;
  formations: ShareFormations;
  date: string;
  onCopied: (msg: string) => void;
}) {
  const [includeDate, setIncludeDate] = useState(false);
  const [layout, setLayout] = useLocalStorage<ShareLayout>('kohot.shareLayout.v1', 'list');
  const ids = useMemo(() => teamsIn(teams), [teams]);

  const text = useMemo(
    () =>
      layout === 'formation'
        ? buildWhatsAppFormationText(formations, { includeDate, date })
        : buildWhatsAppText(teams, { includeDate, date }),
    [layout, teams, formations, includeDate, date],
  );

  const [busy, setBusy] = useState(false);

  const copy = async () => {
    const ok = await copyToClipboard(text);
    onCopied(ok ? 'הועתק ללוח — אפשר להדביק בוואטסאפ 📋' : 'ההעתקה נכשלה, נסו לסמן ידנית');
  };

  const sendImage = async () => {
    setBusy(true);
    try {
      const blob = await renderTeamsImage(teams, date, {
        includeDate,
        formations: layout === 'formation' ? formations : undefined,
      });
      if (!blob) {
        onCopied('יצירת התמונה נכשלה');
        return;
      }
      const filename = `teams-${date}.png`;
      if (await shareImage(blob, filename, 'קבוצות למשחק')) return;
      // אין תפריט שיתוף (בעיקר במחשב) — מורידים את הקובץ במקום
      downloadImage(blob, filename);
      onCopied('התמונה ירדה — אפשר לצרף אותה לוואטסאפ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-100">
          <Share2 size={17} className="text-emerald-400" />
          תצוגת שיתוף נקייה
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-xl border border-slate-700 bg-slate-900/60 p-1 text-xs font-semibold">
            {(
              [
                ['list', '📋 רשימה'],
                ['formation', '⚽ מערך'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setLayout(value)}
                aria-pressed={layout === value}
                className={`rounded-lg px-3 py-1.5 transition ${
                  layout === value
                    ? 'bg-emerald-500/20 text-emerald-200'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={includeDate}
              onChange={(e) => setIncludeDate(e.target.checked)}
              className="size-4 accent-emerald-500"
            />
            <CalendarDays size={13} />
            לצרף תאריך
          </label>
          <button className="btn-primary" onClick={sendImage} disabled={busy}>
            <ImageIcon size={16} />
            {busy ? 'מכין תמונה...' : canShareImage() ? 'שליחת תמונה' : 'הורדת תמונה'}
          </button>
          <button className="btn-ghost" onClick={copy}>
            <Copy size={16} />
            העתקת טקסט
          </button>
        </div>
      </div>

      <div className={teamGridClass(ids.length)}>
        {ids.map((id) => {
          const meta = TEAM_META[id];
          const names = teams[id] ?? [];
          return (
            <section key={id} className={`card overflow-hidden border-2 ${meta.ring}`}>
              <header className={`px-4 py-3 text-center ${meta.header}`}>
                <h3 className="inline-block text-xl font-extrabold">
                  <span className={meta.nameChip}>{meta.name}</span>
                </h3>
              </header>
              {layout === 'formation' && formations[id] ? (
                <SharePitch formation={formations[id]} />
              ) : (
                <ul className={`divide-y divide-slate-800/60 ${meta.softBg}`}>
                  {names.map((name, i) => (
                    <li
                      key={`${name}-${i}`}
                      className="px-4 py-2.5 text-center text-[15px] font-semibold text-slate-100"
                    >
                      {name}
                    </li>
                  ))}
                  {names.length === 0 && (
                    <li className="px-4 py-8 text-center text-xs text-slate-500">אין שחקנים</li>
                  )}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {/* תצוגה מקדימה של הטקסט שיועתק */}
      <div className="card p-4">
        <p className="label">תצוגה מקדימה של ההודעה</p>
        <pre className="max-h-72 overflow-auto rounded-xl bg-slate-950/70 p-4 font-sans text-sm leading-relaxed whitespace-pre-wrap text-slate-300">
          {text || 'אין מה להעתיק עדיין'}
        </pre>
        {includeDate && (
          <p className="mt-2 text-[11px] text-slate-500">התאריך שיצורף: {formatHebrewDate(date)}</p>
        )}
      </div>
    </div>
  );
}

/** השורות במגרש, מהחלוצים למעלה ועד השער למטה */
const PITCH_LINES: FieldPosition[] = ['att', 'mid', 'def', 'gk'];

/**
 * המערך בתצוגת השיתוף: אותו מגרש כמו בעריכה, בלי דירוגים ובלי סימון של מי
 * לא בעמדה שלו.
 */
function SharePitch({ formation }: { formation: ShareFormation }) {
  return (
    <PitchField label={formation.label}>
      {PITCH_LINES.map((line) => {
        const players = formation.lines[line];
        if (line === 'gk' && !players.length) return <RotatingGoal key={line} />;
        if (!players.length) return null;
        return (
          <div key={line} className="flex justify-center gap-1">
            {players.map((player, i) => (
              <div
                key={`${player.name}-${i}`}
                className="flex w-[4.75rem] flex-col items-center gap-0.5 px-0.5 py-1"
              >
                <Avatar name={player.name} photo={player.photo} size={34} />
                <span className="w-full truncate text-center text-[11px] leading-tight font-semibold text-slate-100">
                  {player.name}
                </span>
              </div>
            ))}
          </div>
        );
      })}
    </PitchField>
  );
}
