// הסמל של Teams FC: טבעת ירוקה וכדורגל לבן עם מחומשים.
// משותף לאייקוני ה-PWA ולתמונת השיתוף, כדי שיהיה מקור אחד לצורה.

export const BG = [2, 6, 23]; // כחול-לילה, אותו צבע כמו רקע האפליקציה
export const RING = [16, 185, 129]; // ירוק מגרש
export const BALL = [248, 250, 252];
export const PANEL = [15, 23, 42]; // המחומשים הכהים

/** מחומש משוכלל סביב נקודה, עם קודקוד אחד בכיוון הנתון */
function pentagon(cx, cy, r, rotation) {
  return Array.from({ length: 5 }, (_, i) => {
    const a = rotation + (Math.PI * 2 * i) / 5;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  });
}

/** בדיקת נקודה בתוך מצולע, בשיטת ray casting */
function inPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * מחזיר פונקציה (x, y) => צבע, או null לכל נקודה שמחוץ לסמל —
 * כך שכל קורא מחליט בעצמו מה יש ברקע.
 * outer הוא הרדיוס של הקצה החיצוני של הטבעת.
 */
export function ballPainter(cx, cy, outer) {
  const ringWidth = outer * 0.1;
  const ballR = outer - ringWidth * 1.6;

  // מחומש במרכז וחמישה סביבו, כמו כדור אמיתי
  const panels = [pentagon(cx, cy, ballR * 0.3, -Math.PI / 2)];
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (Math.PI * 2 * i) / 5;
    const d = ballR * 0.68;
    // כל מחומש חיצוני מסובב כך שקודקוד פונה החוצה
    panels.push(pentagon(cx + Math.cos(a) * d, cy + Math.sin(a) * d, ballR * 0.235, a));
  }

  return (x, y) => {
    const d = Math.hypot(x - cx, y - cy);
    if (d > outer) return null;
    if (d > outer - ringWidth) return RING;
    if (d > ballR) return null;
    for (const p of panels) if (inPolygon(x, y, p)) return PANEL;
    return BALL;
  };
}
