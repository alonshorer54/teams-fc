import { MAX_PHOTO_LENGTH } from '../types';

/**
 * הצלע של התמונה השמורה: מספיק כדי שהגדלה בלחיצה (כמו בוואטסאפ) תישאר חדה.
 * באיכות JPEG בינונית זה בערך 8KB לתמונה — כמו 128 פיקסלים באיכות גבוהה. זה
 * חשוב כי כל התמונות יושבות במסמך השחקנים, ו-Supabase מפסיק להעביר בזמן אמת
 * שורה מעל 1MB.
 */
const SIDE = 224;

/**
 * תמונת מקור מוקטנת לזה לפני החיתוך: צילום של 12MP היה תופס עשרות MB בזיכרון
 * לכל תמונה בתור. גם בהגדלה פי 4 נשארים 200 פיקסלים — יותר מ-128 של התוצאה
 */
const MAX_SOURCE = 800;

/**
 * איזה ריבוע מהתמונה נכנס לעיגול: מרכז בפיקסלים של המקור, ויחס הגדלה —
 * 1 = הריבוע הגדול ביותר שנכנס בתמונה, 4 = רבע ממנו.
 */
export interface Crop {
  cx: number;
  cy: number;
  zoom: number;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

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

/** מזיז את המרכז כך שהריבוע לא יוצא מגבולות התמונה */
export function clampCrop(src: HTMLCanvasElement, crop: Crop): Crop {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, crop.zoom));
  const half = cropSide(src, zoom) / 2;
  return {
    zoom,
    cx: Math.min(src.width - half, Math.max(half, crop.cx)),
    cy: Math.min(src.height - half, Math.max(half, crop.cy)),
  };
}

/**
 * נקודת ההתחלה: כל הריבוע במרכז. בתמונה לאורך הפנים כמעט תמיד בחלק העליון,
 * אז שם מתחילים — מרכז מדויק היה חותך את הראש ומשאיר חזה.
 */
export function defaultCrop(src: HTMLCanvasElement): Crop {
  const side = cropSide(src, 1);
  const portrait = src.height > src.width;
  return clampCrop(src, {
    zoom: 1,
    cx: src.width / 2,
    cy: portrait ? side / 2 + (src.height - side) * 0.2 : src.height / 2,
  });
}

/** מצייר את הריבוע הנבחר על קנבס ריבועי בגודל `size` */
export function drawCrop(
  ctx: CanvasRenderingContext2D,
  src: HTMLCanvasElement,
  crop: Crop,
  size: number,
) {
  const side = cropSide(src, crop.zoom);
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(src, crop.cx - side / 2, crop.cy - side / 2, side, side, 0, 0, size, size);
}

/** התמונה הסופית שנשמרת אצל השחקן: JPEG ריבועי קטן */
export function encodePhoto(src: HTMLCanvasElement, crop: Crop): string {
  const canvas = document.createElement('canvas');
  canvas.width = SIDE;
  canvas.height = SIDE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('הדפדפן לא מאפשר לעבד תמונות');
  drawCrop(ctx, src, clampCrop(src, crop), SIDE);

  // תמונה עשירה בפרטים יכולה לצאת גדולה מהצפוי — מורידים איכות עד שהיא נכנסת
  for (const quality of [0.7, 0.6, 0.5]) {
    const url = canvas.toDataURL('image/jpeg', quality);
    if (url.length <= MAX_PHOTO_LENGTH) return url;
  }
  throw new Error('התמונה גדולה מדי — נסו תמונה אחרת');
}
