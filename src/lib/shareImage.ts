import { TEAM_META, teamsIn, type TeamId } from '../types';
import type { ShareFormations, ShareTeams } from './format';
import { formatHebrewDate } from './format';
import type { FieldPosition } from './formation';

/** השורות במגרש, מהחלוצים למעלה ועד השער למטה — כמו בתצוגת המגרש באפליקציה */
const PITCH_LINES: FieldPosition[] = ['att', 'mid', 'def', 'gk'];

/**
 * מצייר את הקבוצות על קנבס ומחזיר PNG.
 * נועד לשיתוף ישיר בוואטסאפ, בלי לצלם מסך.
 *
 * הרוחב קבוע והעמודות מתחלקות בו שווה בשווה, כך שהתמונה נראית מיושרת
 * גם בשתי קבוצות וגם בשלוש.
 */
export async function renderTeamsImage(
  teams: ShareTeams,
  date: string,
  options: {
    includeDate?: boolean;
    /** כשיש — כל קבוצה מצוירת כחצי מגרש לפי המערך, במקום רשימה */
    formations?: ShareFormations;
  } = {},
): Promise<Blob | null> {
  const ids = teamsIn(teams);
  if (!ids.length) return null;
  const { formations } = options;

  const scale = 2; // כדי שייצא חד גם במסכי רטינה
  const W = 1080;
  const pad = 40;
  const colGap = 24;
  const colW = (W - pad * 2 - colGap * (ids.length - 1)) / ids.length;
  const headerH = 74;
  const rowH = 62;
  const lineH = 76;
  const titleH = options.includeDate ? 116 : 72;

  // במערך כל שורה היא עמדה; קישור ריק (בקבוצה של 5) לא תופס שורה, השער תמיד כן
  const pitchLines = (teamId: TeamId): FieldPosition[] =>
    PITCH_LINES.filter((line) => line === 'gk' || formations![teamId]!.lines[line].length);
  const bodyH = (teamId: TeamId) =>
    formations?.[teamId]
      ? pitchLines(teamId).length * lineH + 24
      : Math.max((teams[teamId] ?? []).length, 1) * rowH;

  const H = titleH + headerH + Math.max(...ids.map(bodyH)) + pad * 2;

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
  ctx.fillText('⚽ קבוצות למשחק', W / 2, pad + 34);
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
  ids.forEach((teamId, index) => {
    const x = W - pad - colW - index * (colW + colGap);
    const y = titleH + pad / 2;
    const names = teams[teamId] ?? [];
    const formation = formations?.[teamId];
    const cardH = headerH + bodyH(teamId);

    // גוף הכרטיס
    ctx.fillStyle = formation ? '#064e3b' : '#0f172a';
    roundRect(x, y, colW, cardH, 18);
    ctx.fill();

    // כותרת הקבוצה
    ctx.save();
    roundRect(x, y, colW, cardH, 18);
    ctx.clip();
    const colors = TEAM_META[teamId].hex;
    const bandW = colW / colors.length;
    colors.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.fillRect(x + i * bandW, y, bandW + 1, headerH);
    });
    ctx.restore();

    ctx.fillStyle = TEAM_META[teamId].hexText;
    ctx.font = font(34);
    ctx.textAlign = 'center';
    ctx.fillText(TEAM_META[teamId].name, x + colW / 2, y + headerH / 2 + 12);

    if (formation) {
      const top = y + headerH;
      const pitchH = bodyH(teamId);

      // סימוני חצי מגרש: חצי עיגול למעלה, רחבה למטה
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x + colW / 2, top, 44, 0, Math.PI);
      ctx.stroke();
      ctx.strokeRect(x + colW * 0.28, top + pitchH - 58, colW * 0.44, 58);

      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = font(20, '600');
      ctx.textAlign = 'right';
      ctx.fillText(formation.label, x + colW - 14, top + 30);

      ctx.textAlign = 'center';
      pitchLines(teamId).forEach((line, i) => {
        const lineY = top + 12 + i * lineH + lineH / 2 + 9;
        const here = formation.lines[line];
        if (line === 'gk' && !here.length) {
          ctx.fillStyle = 'rgba(226,232,240,0.6)';
          ctx.font = font(22, '600');
          ctx.fillText('🧤 מתחלפים בשער', x + colW / 2, lineY);
          return;
        }
        // שמות באותה שורה מתחלקים שווה ברוחב, מימין לשמאל. כל שם על רקע משלו —
        // בלי זה שלושה שמות בשורה נקראים כמו שם ארוך אחד
        const slotW = (colW - 12) / here.length;
        ctx.font = font(here.length >= 3 ? 20 : 24, '600');
        here.forEach((name, j) => {
          const cx = x + colW - 6 - slotW * (j + 0.5);
          const pillW = Math.min(ctx.measureText(name).width + 18, slotW - 6);
          ctx.fillStyle = 'rgba(2,6,23,0.45)';
          roundRect(cx - pillW / 2, lineY - 27, pillW, 38, 10);
          ctx.fill();
          ctx.fillStyle = '#f8fafc';
          ctx.fillText(name, cx, lineY, pillW - 12);
        });
      });
      return;
    }

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
