import { useMemo, useState } from 'react';
import { CalendarDays, Copy, Image as ImageIcon, Share2 } from 'lucide-react';
import { TEAM_META, teamGridClass, teamsIn } from '../types';
import { buildWhatsAppText, copyToClipboard, formatHebrewDate, type ShareTeams } from '../lib/format';
import { canShareImage, downloadImage, renderTeamsImage, shareImage } from '../lib/shareImage';


/**
 * "מצב וואטסאפ" — תצוגה נקייה לחלוטין: שמות קבוצות ושמות שחקנים בלבד.
 * ללא דירוגים, ללא ממוצעים וללא סימוני כימיה.
 */
export function ShareView({
  teams,
  date,
  onCopied,
}: {
  teams: ShareTeams;
  date: string;
  onCopied: (msg: string) => void;
}) {
  const [includeDate, setIncludeDate] = useState(false);
  const ids = useMemo(() => teamsIn(teams), [teams]);

  const text = useMemo(
    () => buildWhatsAppText(teams, { includeDate, date }),
    [teams, includeDate, date],
  );

  const [busy, setBusy] = useState(false);

  const copy = async () => {
    const ok = await copyToClipboard(text);
    onCopied(ok ? 'הועתק ללוח — אפשר להדביק בוואטסאפ 📋' : 'ההעתקה נכשלה, נסו לסמן ידנית');
  };

  const sendImage = async () => {
    setBusy(true);
    try {
      const blob = await renderTeamsImage(teams, date, { includeDate });
      if (!blob) {
        onCopied('יצירת התמונה נכשלה');
        return;
      }
      const filename = `teams-${date}.png`;
      if (await shareImage(blob, filename, 'כוחות למשחק')) return;
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
                <h3 className="text-xl font-extrabold">
                  {meta.emoji} {meta.name}
                </h3>
              </header>
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
