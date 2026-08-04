import { TEAM_IDS, TEAM_META, type TeamId } from '../types';

export interface ShareTeams {
  white: string[];
  black: string[];
  colored: string[];
}

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
    blocks.push(`⚽ כוחות ${formatHebrewDate(options.date)}`);
  }

  for (const id of TEAM_IDS) {
    const meta = TEAM_META[id];
    const names = teams[id];
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
