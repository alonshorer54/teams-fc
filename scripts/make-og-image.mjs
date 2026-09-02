// מייצר את תמונת השיתוף (og:image) — מה שמופיע כשמדביקים את הקישור
// בוואטסאפ, בפייסבוק או בטלגרם. הרצה: npm run og
import { writeFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { encodePng } from './png.mjs';
import { ballPainter, BG } from './ball.mjs';

// המידה שכל הרשתות מצפות לה. פחות מזה, וההצגה מתכווצת לתמונה ממוזערת.
const W = 1200;
const H = 630;

const MOWED = [8, 15, 35]; // פסי דשא כהים, בקושי מורגשים
const STRIPES = 10;

/** דגימת-על: 3x3 דגימות לפיקסל, כדי שהקצוות ייצאו חלקים ולא משוננים */
const SS = 3;

const ball = ballPainter(W / 2, H / 2, 215);

function colorAt(x, y) {
  const fromBall = ball(x, y);
  if (fromBall) return fromBall;
  // רקע: פסים אנכיים כמו מגרש מכוסח
  return Math.floor((x / W) * STRIPES) % 2 === 0 ? BG : MOWED;
}

const px = Buffer.alloc(W * H * 4);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
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
    const i = (y * W + x) * 4;
    px[i] = Math.round(r / n);
    px[i + 1] = Math.round(g / n);
    px[i + 2] = Math.round(b / n);
    px[i + 3] = 255;
  }
}

writeFileSync('public/og-image.png', encodePng(W, H, px));
console.log(`wrote public/og-image.png ${W}x${H}`);
