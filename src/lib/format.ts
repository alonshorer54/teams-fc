import { TEAM_META, teamsIn, type TeamId, type TeamMap } from '../types';

/** שמות השחקנים לכל קבוצה משתתפת — הקלט של כל מסלולי השיתוף. */
export type ShareTeams = TeamMap<string[]>;

export interface ShareOptions {
  /** האם לצרף שורת תאריך בראש ההודעה (ברירת מחדל: לא — טקסט נקי לגמרי) */
  includeDate?: boolean;
  date?: string;
}

/**
 * מייצר טקסט מוכן להדבקה בוואטסאפ: שמות קבוצות + שמות שחקנים בלבד.
 * ללא דירוגים, ללא ממוצעים וללא מספור.
 */
export function buildWhatsAppText(teams: ShareTeams, options: ShareOptions = {}): string {
  const blocks: string[] = [];

  if (options.includeDate && options.date) {
    blocks.push(`⚽ קבוצות ${formatHebrewDate(options.date)}`);
  }

  for (const id of teamsIn(teams)) {
    const meta = TEAM_META[id];
    const names = teams[id] ?? [];
    if (!names.length) continue;
    blocks.push([`${meta.emoji} *${meta.name}*`, ...names.map((n) => `• ${n}`)].join('\n'));
  }

  return blocks.join('\n\n');
}

/** תאריך בפורמט ישראלי: יום בשבוע + dd.mm.yyyy */
export function formatHebrewDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  const pad = (n: number) => String(n).padStart(2, '0');
  return `יום ${days[d.getDay()]} ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

export function todayISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * מקדם תאריך מחזור שכבר עבר לשבוע הבא, בקפיצות של שבוע שלם.
 *
 * הקפיצה בת שבעה ימים היא מה ששומר על היום בשבוע בלי להגדיר אותו בשום מקום:
 * מי שמשחק ברביעי יקבל את רביעי הבא, ומי שמשחק בחמישי את חמישי הבא. שעה 12:00
 * כדי ששעון קיץ לא יזיז את התאריך ביום.
 */
export function rollRoundDate(current: string, today = todayISO()): string {
  if (!current || current >= today) return current;

  const d = new Date(`${current}T12:00:00`);
  const now = new Date(`${today}T12:00:00`);
  while (d < now) d.setDate(d.getDate() + 7);

  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** העתקה ללוח עם נפילה חזרה ל-execCommand בדפדפנים/הקשרים ללא הרשאה. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

export const teamLabel = (id: TeamId) => TEAM_META[id].name;
