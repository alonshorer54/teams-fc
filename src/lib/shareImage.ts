import { TEAM_META, isPlayerPhoto, teamsIn, type TeamId } from '../types';
import type { ShareFormations, ShareTeams } from './format';
import { formatHebrewDate } from './format';
import type { FieldPosition } from './formation';

/** השורות במגרש, מהחלוצים למעלה ועד השער למטה — כמו בתצוגת המגרש באפליקציה */
const PITCH_LINES: FieldPosition[] = ['att', 'mid', 'def', 'gk'];

/** המרווח בראש המגרש — מקום לתווית המערך מעל שורת החלוצים */
const PITCH_TOP = 40;
/** רדיוס העיגול של שחקן, ורוחב המשבצת שלו בשורה */
const AVATAR_R = 32;
const TOKEN_W = 136;

/**
 * צבעי העיגול לשחקן בלי תמונה — אותם צבעים ואותה בחירה לפי השם כמו ב-Avatar,
 * כך שכל שחקן נראה בתמונה כמו באפליקציה.
 */
const AVATAR_FILLS: [string, string][] = [
  ['rgba(5,150,105,0.55)', '#d1fae5'],
  ['rgba(2,132,199,0.55)', '#e0f2fe'],
  ['rgba(124,58,237,0.55)', '#ede9fe'],
  ['rgba(217,119,6,0.55)', '#fef3c7'],
  ['rgba(225,29,72,0.55)', '#ffe4e6'],
  ['rgba(13,148,136,0.55)', '#ccfbf1'],
];

/** התמונות של השחקנים, טעונות מראש — קנבס לא יכול לחכות לתמונה באמצע ציור */
async function loadPhotos(formations: ShareFormations): Promise<Map<string, HTMLImageElement>> {
  const sources = new Set(
    teamsIn(formations)
      .flatMap((t) => Object.values(formations[t]!.lines).flat())
      .map((p) => p.photo)
      .filter(isPlayerPhoto),
  );
  const loaded = new Map<string, HTMLImageElement>();
  await Promise.all(
    [...sources].map(async (src) => {
      const img = new Image();
      img.src = src;
      try {
        await img.decode();
        loaded.set(src, img);
      } catch {
        // תמונה שלא נטענת — השחקן יקבל עיגול עם האות הראשונה, כמו בלי תמונה
      }
    }),
  );
  return loaded;
}

/** עיגול השחקן: התמונה שלו, ובלעדיה האות הראשונה של השם */
function drawAvatar(
  ctx: CanvasRenderingContext2D,
  name: string,
  photo: HTMLImageElement | undefined,
  x: number,
  y: number,
  r: number,
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (photo) {
    ctx.clip();
    ctx.drawImage(photo, x - r, y - r, r * 2, r * 2);
  } else {
    let hash = 0;
    for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    const [fill, text] = AVATAR_FILLS[hash % AVATAR_FILLS.length];
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.fillStyle = text;
    ctx.font = `700 ${Math.round(r * 0.84)}px "Rubik","Assistant","Segoe UI",system-ui,sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name.trim().charAt(0), x, y + 1);
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 2;
  ctx.stroke();
}

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
  const photos = formations ? await loadPhotos(formations) : new Map<string, HTMLImageElement>();

  const scale = 2; // כדי שייצא חד גם במסכי רטינה
  // מגרש צריך רוחב: שלושה שחקנים בשורה, כל אחד עם עיגול ושם, בשלוש עמודות
  const W = formations && ids.length > 2 ? 1440 : 1080;
  const pad = 40;
  const colGap = 24;
  const colW = (W - pad * 2 - colGap * (ids.length - 1)) / ids.length;
  const headerH = 74;
  const rowH = 62;
  const lineH = 128;
  const titleH = options.includeDate ? 116 : 72;

  // במערך כל שורה היא עמדה; קישור ריק (בקבוצה של 5) לא תופס שורה, השער תמיד כן
  const pitchLines = (teamId: TeamId): FieldPosition[] =>
    PITCH_LINES.filter((line) => line === 'gk' || formations![teamId]!.lines[line].length);
  const bodyH = (teamId: TeamId) =>
    formations?.[teamId]
      ? PITCH_TOP + pitchLines(teamId).length * lineH + 16
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
      const cx = x + colW / 2;

      // דשא, וסימוני חצי מגרש — אותו מגרש כמו באפליקציה
      ctx.save();
      roundRect(x, y, colW, cardH, 18);
      ctx.clip();
      const grass = ctx.createLinearGradient(0, top, 0, top + pitchH);
      grass.addColorStop(0, '#0f3d2e');
      grass.addColorStop(1, '#05261b');
      ctx.fillStyle = grass;
      ctx.fillRect(x, top, colW, pitchH);
      ctx.restore();

      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 2;
      roundRect(x + 10, top + 8, colW - 20, pitchH - 16, 8);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, top + 8, 46, 0, Math.PI);
      ctx.stroke();
      ctx.strokeRect(x + colW * 0.3, top + pitchH - 8 - 76, colW * 0.4, 76);

      // תווית המערך בפינה, כמו בכרטיס באפליקציה
      ctx.font = font(19, '700');
      const label = `מערך ${formation.label}`;
      const labelW = ctx.measureText(label).width + 20;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      roundRect(x + colW - 20 - labelW, top + 18, labelW, 32, 8);
      ctx.fill();
      ctx.fillStyle = '#a7f3d0';
      ctx.textAlign = 'center';
      ctx.fillText(label, x + colW - 20 - labelW / 2, top + 41);

      pitchLines(teamId).forEach((line, i) => {
        const lineTop = top + PITCH_TOP + i * lineH;
        const here = formation.lines[line];

        if (line === 'gk' && !here.length) {
          ctx.font = font(21, '600');
          const text = '🧤 מתחלפים בשער';
          const w = ctx.measureText(text).width + 32;
          ctx.fillStyle = 'rgba(0,0,0,0.2)';
          roundRect(cx - w / 2, lineTop + 34, w, 46, 10);
          ctx.fill();
          ctx.setLineDash([6, 5]);
          ctx.strokeStyle = 'rgba(255,255,255,0.25)';
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = '#cbd5e1';
          ctx.textAlign = 'center';
          ctx.fillText(text, cx, lineTop + 64);
          return;
        }

        // השחקנים בשורה מרוכזים באמצע, כל אחד במשבצת בגודל קבוע — עיגול ושם מתחתיו
        const tokenW = Math.min(TOKEN_W, (colW - 24) / here.length);
        here.forEach((player, j) => {
          const px = cx + ((here.length - 1) / 2 - j) * tokenW;
          drawAvatar(ctx, player.name, photos.get(player.photo ?? ''), px, lineTop + 40, AVATAR_R);
          ctx.fillStyle = '#f1f5f9';
          ctx.font = font(22, '600');
          ctx.textAlign = 'center';
          ctx.fillText(player.name, px, lineTop + 40 + AVATAR_R + 30, tokenW - 10);
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
