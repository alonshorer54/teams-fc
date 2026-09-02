// מייצר את אייקוני ה-PWA כ-PNG, בלי תלות בספריות חיצוניות.
// הרצה: npm run icons
import { writeFileSync, mkdirSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { encodePng } from './png.mjs';
import { ballPainter, BG } from './ball.mjs';

/** דגימת-על: 3x3 דגימות לפיקסל, כדי שהקצוות ייצאו חלקים ולא משוננים */
const SS = 3;

function drawIcon(size, { padding }) {
  const px = Buffer.alloc(size * size * 4);
  const c = size / 2;
  const ball = ballPainter(c, c, size * (0.5 - padding));

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // ממוצע של SS×SS דגימות בתוך הפיקסל
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const col = ball(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS) ?? BG;
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
  writeFileSync(file, encodePng(size, size, drawIcon(size, { padding })));
  console.log('wrote', file, size + 'px');
}
