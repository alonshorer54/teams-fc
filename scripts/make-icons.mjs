// מייצר את אייקוני ה-PWA כ-PNG, בלי תלות בספריות חיצוניות.
// הרצה: npm run icons
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { Buffer } from 'node:buffer';

const BG = [2, 6, 23, 255]; // כחול-לילה, אותו צבע כמו רקע האפליקציה
const RING = [16, 185, 129, 255]; // ירוק מגרש
const BALL = [248, 250, 252, 255];
const PANEL = [15, 23, 42, 255]; // המחומשים הכהים

/** דגימת-על: 3x3 דגימות לפיקסל, כדי שהקצוות ייצאו חלקים ולא משוננים */
const SS = 3;

/* ------------------------------ קידוד PNG ------------------------------ */

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, pixels) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(size * stride);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // filter: none
    pixels.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------ גאומטריה ------------------------------ */

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
 * כדורגל: רקע כהה, טבעת ירוקה, כדור לבן עם מחומשים —
 * מחומש במרכז וחמישה סביבו, כמו כדור אמיתי.
 */
function drawIcon(size, { padding }) {
  const px = Buffer.alloc(size * size * 4);
  const c = size / 2;
  const outer = size * (0.5 - padding); // הקצה החיצוני של הטבעת
  const ringWidth = outer * 0.1;
  const ballR = outer - ringWidth * 1.6;

  // מרכזי המחומשים ורדיוסיהם
  const panels = [pentagon(c, c, ballR * 0.3, -Math.PI / 2)];
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (Math.PI * 2 * i) / 5;
    const d = ballR * 0.68;
    // כל מחומש חיצוני מסובב כך שקודקוד פונה החוצה
    panels.push(pentagon(c + Math.cos(a) * d, c + Math.sin(a) * d, ballR * 0.235, a));
  }

  const colorAt = (x, y) => {
    const d = Math.hypot(x - c, y - c);
    if (d > outer) return BG;
    if (d > outer - ringWidth) return RING;
    if (d > ballR) return BG;
    for (const p of panels) if (inPolygon(x, y, p)) return PANEL;
    return BALL;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // ממוצע של SS×SS דגימות בתוך הפיקסל
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const col = colorAt(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS);
          r += col[0];
          g += col[1];
          b += col[2];
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      px[i] = Math.round(r / n);
      px[i + 1] = Math.round(g / n);
      px[i + 2] = Math.round(b / n);
      px[i + 3] = 255;
    }
  }
  return px;
}

/* -------------------------------- כתיבה -------------------------------- */

mkdirSync('public/icons', { recursive: true });

const targets = [
  // maskable צריך שוליים גדולים יותר, כי אנדרואיד חותך את הפינות
  { file: 'public/icons/icon-192.png', size: 192, padding: 0.06 },
  { file: 'public/icons/icon-512.png', size: 512, padding: 0.06 },
  { file: 'public/icons/maskable-512.png', size: 512, padding: 0.19 },
  { file: 'public/icons/apple-touch-icon.png', size: 180, padding: 0.06 },
];

for (const { file, size, padding } of targets) {
  writeFileSync(file, encodePng(size, drawIcon(size, { padding })));
  console.log('wrote', file, size + 'px');
}
