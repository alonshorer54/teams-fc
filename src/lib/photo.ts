import { MAX_PHOTO_LENGTH } from '../types';

/** הצלע של התמונה השמורה. מוצגת בכ-32 פיקסלים, אז 96 מספיק גם למסך רטינה */
const SIDE = 96;

/**
 * הופך תמונה שנבחרה (גם צילום של כמה MB מהטלפון) לריבוע קטן במרכז התמונה,
 * כ-JPEG של כמה KB. התמונות נשמרות בתוך מסמך השחקנים שמסתנכרן בכל שינוי,
 * ולכן חייבות להיות קטנות.
 */
export async function photoFromFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('הקובץ שנבחר אינו תמונה');

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('לא הצלחנו לקרוא את התמונה — נסו תמונה אחרת');
  }

  const crop = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = SIDE;
  canvas.height = SIDE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('הדפדפן לא מאפשר לעבד תמונות');

  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    bitmap,
    (bitmap.width - crop) / 2,
    (bitmap.height - crop) / 2,
    crop,
    crop,
    0,
    0,
    SIDE,
    SIDE,
  );
  bitmap.close();

  // תמונה עשירה בפרטים יכולה לצאת גדולה מהצפוי — מורידים איכות עד שהיא נכנסת
  for (const quality of [0.8, 0.65, 0.5]) {
    const url = canvas.toDataURL('image/jpeg', quality);
    if (url.length <= MAX_PHOTO_LENGTH) return url;
  }
  throw new Error('התמונה גדולה מדי — נסו תמונה אחרת');
}
