import { TEAM_IDS, TEAM_META, type TeamId } from '../types';
import type { ShareTeams } from './format';
import { formatHebrewDate } from './format';

/** צבעי הכותרות בתמונה — מקבילים לצבעי הקבוצות באפליקציה */
const HEADER: Record<TeamId, string[]> = {
  white: ['#e2e8f0'],
  black: ['#1e293b'],
  colored: ['#2563eb', '#facc15', '#dc2626'],
};

const HEADER_TEXT: Record<TeamId, string> = {
  white: '#0f172a',
  black: '#f1f5f9',
  colored: '#ffffff',
};

/**
 * מצייר את שלוש הקבוצות על קנבס ומחזיר PNG.
 * נועד לשיתוף ישיר בוואטסאפ, בלי לצלם מסך.
 */
export async function renderTeamsImage(
  teams: ShareTeams,
  date: string,
  options: { includeDate?: boolean } = {},
): Promise<Blob | null> {
  const scale = 2; // כדי שייצא חד גם במסכי רטינה
  const W = 1080;
  const pad = 40;
  const colGap = 24;
  const colW = (W - pad * 2 - colGap * 2) / 3;
  const headerH = 74;
  const rowH = 62;
  const titleH = options.includeDate ? 116 : 72;

  const maxRows = Math.max(...TEAM_IDS.map((t) => teams[t].length), 1);
  const H = titleH + headerH + maxRows * rowH + pad * 2;

  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(scale, scale);

  const font = (size: number, weight = '700') =>
    `${weight} ${size}px "Rubik","Assistant","Segoe UI",system-ui,sans-serif`;

  // רקע
  ctx.fillStyle = '#020617';
  ctx.fillRect(0, 0, W, H);

  // כותרת
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f8fafc';
  ctx.font = font(40);
  ctx.fillText('⚽ כוחות למשחק', W / 2, pad + 34);
  if (options.includeDate) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = font(26, '500');
    ctx.fillText(formatHebrewDate(date), W / 2, pad + 76);
  }

  const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  // עמודה לכל קבוצה — מימין לשמאל, כמו באפליקציה
  TEAM_IDS.forEach((teamId, index) => {
    const x = W - pad - colW - index * (colW + colGap);
    const y = titleH + pad / 2;
    const names = teams[teamId];
    const bodyH = Math.max(names.length, 1) * rowH;

    // גוף הכרטיס
    ctx.fillStyle = '#0f172a';
    roundRect(x, y, colW, headerH + bodyH, 18);
    ctx.fill();

    // כותרת הקבוצה
    ctx.save();
    roundRect(x, y, colW, headerH + bodyH, 18);
    ctx.clip();
    const colors = HEADER[teamId];
    const bandW = colW / colors.length;
    colors.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.fillRect(x + i * bandW, y, bandW + 1, headerH);
    });
    ctx.restore();

    ctx.fillStyle = HEADER_TEXT[teamId];
    ctx.font = font(34);
    ctx.textAlign = 'center';
    ctx.fillText(TEAM_META[teamId].name, x + colW / 2, y + headerH / 2 + 12);

    // שמות
    names.forEach((name, i) => {
      const rowY = y + headerH + i * rowH;
      if (i % 2 === 1) {
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        ctx.fillRect(x, rowY, colW, rowH);
      }
      ctx.fillStyle = '#e2e8f0';
      ctx.font = font(28, '500');
      ctx.textAlign = 'center';
      ctx.fillText(name, x + colW / 2, rowY + rowH / 2 + 10, colW - 24);
    });
  });

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}

/** האם הדפדפן יודע לשתף קבצים (וואטסאפ, מיילים וכו') */
export function canShareImage(): boolean {
  if (typeof navigator === 'undefined' || !navigator.canShare) return false;
  try {
    const probe = new File([new Blob()], 'p.png', { type: 'image/png' });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

/** פותח את תפריט השיתוף של המכשיר עם התמונה. מחזיר false אם לא נתמך. */
export async function shareImage(blob: Blob, filename: string, title: string): Promise<boolean> {
  const file = new File([blob], filename, { type: 'image/png' });
  if (!navigator.canShare?.({ files: [file] })) return false;
  try {
    await navigator.share({ files: [file], title });
    return true;
  } catch (err) {
    // המשתמש ביטל את תפריט השיתוף — לא שגיאה אמיתית
    if ((err as Error)?.name === 'AbortError') return true;
    return false;
  }
}

/** הורדת התמונה כקובץ, כשאין תמיכה בשיתוף */
export function downloadImage(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
