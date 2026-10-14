import { MAX_PHOTO_LENGTH } from '../types';
import { MAX_FULL_PHOTO_LENGTH } from './fullPhotos';

/**
 * הצלע של העיגול השמור. באיכות JPEG בינונית זה בערך 8KB לתמונה — חשוב, כי כל
 * העיגולים יושבים במסמך השחקנים, ו-Supabase מפסיק להעביר בזמן אמת שורה מעל 1MB.
 * בהגדלה מוצגת התמונה המלאה (fullPhotos.ts), לא העיגול.
 */
const SIDE = 224;

/**
 * תמונת מקור מוקטנת לזה לפני החיתוך: צילום של 12MP היה תופס עשרות MB בזיכרון
 * לכל תמונה בתור. תמונות פרופיל של וואטסאפ הן 640 — נכנסות כמו שהן
 */
const MAX_SOURCE = 800;

/** הצלע של הפנים בהגדלה */
const FULL_SIDE = 512;

/**
 * איזה ריבוע מהתמונה נכנס לעיגול: מרכז בפיקסלים של המקור, ויחס הגדלה —
 * 1 = הריבוע הגדול ביותר שנכנס בתמונה, 8 = שמינית ממנו (פנים קטנות בתמונה רחוקה).
 * הריבוע יכול לחרוג מהתמונה: כך פנים שבקצה התמונה עדיין יושבות באמצע העיגול,
 * והחלק החסר מתמלא בטשטוש של התמונה עצמה.
 */
export interface Crop {
  cx: number;
  cy: number;
  zoom: number;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 8;

/** טוען תמונה שנבחרה, ומקטין אותה לגודל שנוח לחתוך ממנו. */
export async function loadPhoto(file: Blob): Promise<HTMLCanvasElement> {
  if (!file.type.startsWith('image/')) throw new Error('הקובץ שנבחר אינו תמונה');

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('לא הצלחנו לקרוא את התמונה — נסו תמונה אחרת');
  }

  const scale = Math.min(1, MAX_SOURCE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('הדפדפן לא מאפשר לעבד תמונות');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

/** צלע הריבוע שנחתך מהמקור, בפיקסלים של המקור */
export const cropSide = (src: HTMLCanvasElement, zoom: number) =>
  Math.min(src.width, src.height) / zoom;

/** המרכז נשאר בתוך התמונה — אחרת אפשר היה לגרור את כל התמונה אל מחוץ לעיגול */
export function clampCrop(src: HTMLCanvasElement, crop: Crop): Crop {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, crop.zoom));
  return {
    zoom,
    cx: Math.min(src.width, Math.max(0, crop.cx)),
    cy: Math.min(src.height, Math.max(0, crop.cy)),
  };
}

/** האם הריבוע יוצא מגבולות התמונה (ואז מציירים מילוי מטושטש מאחוריו) */
const overflows = (src: HTMLCanvasElement, crop: Crop) => {
  const half = cropSide(src, crop.zoom) / 2;
  return (
    crop.cx - half < 0 || crop.cy - half < 0 || crop.cx + half > src.width || crop.cy + half > src.height
  );
};

/**
 * נקודת ההתחלה: כל הריבוע במרכז. בתמונה לאורך הפנים כמעט תמיד בחלק העליון,
 * אז שם מתחילים — מרכז מדויק היה חותך את הראש ומשאיר חזה.
 */
export function defaultCrop(src: HTMLCanvasElement): Crop {
  const side = cropSide(src, 1);
  const portrait = src.height > src.width;
  return {
    zoom: 1,
    cx: src.width / 2,
    cy: portrait ? side / 2 + (src.height - side) * 0.2 : src.height / 2,
  };
}

/** מצייר את הריבוע הנבחר על קנבס ריבועי בגודל `size` */
export function drawCrop(
  ctx: CanvasRenderingContext2D,
  src: HTMLCanvasElement,
  crop: Crop,
  size: number,
) {
  const side = cropSide(src, crop.zoom);
  const left = crop.cx - side / 2;
  const top = crop.cy - side / 2;
  const scale = size / side;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, size, size);

  if (overflows(src, crop)) {
    // הרקע: כל התמונה מתוחה ומטושטשת, קצת מוחשכת — שהקצה לא ייראה כמו פס שחור
    ctx.save();
    ctx.filter = `blur(${Math.round(size / 18)}px)`;
    ctx.drawImage(src, 0, 0, src.width, src.height, -size * 0.1, -size * 0.1, size * 1.2, size * 1.2);
    ctx.restore();
    ctx.fillStyle = 'rgba(2, 6, 23, 0.35)';
    ctx.fillRect(0, 0, size, size);
  }

  // רק החלק שבתוך התמונה — מקור שחורג מהגבולות מצויר אחרת בכל דפדפן
  const sx = Math.max(0, left);
  const sy = Math.max(0, top);
  const sw = Math.min(src.width, left + side) - sx;
  const sh = Math.min(src.height, top + side) - sy;
  if (sw > 0 && sh > 0) {
    ctx.drawImage(src, sx, sy, sw, sh, (sx - left) * scale, (sy - top) * scale, sw * scale, sh * scale);
  }
}

/**
 * חידוד עדין אחרי ההקטנה: הקטנה (וגם פנים קטנות בתמונה רחוקה) מרככת קווים,
 * ובעיגול של 30 פיקסלים זה ההבדל בין "מישהו" לבין לזהות מי.
 */
function sharpen(ctx: CanvasRenderingContext2D, size: number, amount = 0.45) {
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  const out = new Uint8ClampedArray(d);
  const row = size * 4;
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const i = y * row + x * 4;
      for (let c = 0; c < 3; c++) {
        const blur = (d[i - 4 + c] + d[i + 4 + c] + d[i - row + c] + d[i + row + c]) / 4;
        out[i + c] = d[i + c] + (d[i + c] - blur) * amount;
      }
    }
  }
  img.data.set(out);
  ctx.putImageData(img, 0, 0);
}

/** התמונה הסופית שנשמרת אצל השחקן: JPEG ריבועי קטן */
export function encodePhoto(src: HTMLCanvasElement, crop: Crop): string {
  const canvas = document.createElement('canvas');
  canvas.width = SIDE;
  canvas.height = SIDE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('הדפדפן לא מאפשר לעבד תמונות');
  drawCrop(ctx, src, clampCrop(src, crop), SIDE);
  sharpen(ctx, SIDE);

  // תמונה עשירה בפרטים יכולה לצאת גדולה מהצפוי — מורידים איכות עד שהיא נכנסת
  for (const quality of [0.7, 0.6, 0.5]) {
    const url = canvas.toDataURL('image/jpeg', quality);
    if (url.length <= MAX_PHOTO_LENGTH) return url;
  }
  throw new Error('התמונה גדולה מדי — נסו תמונה אחרת');
}

/**
 * מה שמוצג כשלוחצים על העיגול: אותו חיתוך של הפנים, בגדול — עד 512 פיקסלים,
 * בלי להמציא פרטים שאין במקור.
 */
export function encodeFull(src: HTMLCanvasElement, crop: Crop): string {
  const c = clampCrop(src, crop);
  const size = Math.round(Math.min(FULL_SIDE, Math.max(SIDE, cropSide(src, c.zoom))));
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('הדפדפן לא מאפשר לעבד תמונות');
  drawCrop(ctx, src, c, size);
  for (const quality of [0.88, 0.78, 0.65]) {
    const url = canvas.toDataURL('image/jpeg', quality);
    if (url.length <= MAX_FULL_PHOTO_LENGTH) return url;
  }
  throw new Error('התמונה גדולה מדי — נסו תמונה אחרת');
}
