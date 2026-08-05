// מייצר את אייקוני ה-PWA כ-PNG שטוחים, בלי תלות בספריות חיצוניות.
// הרצה: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { Buffer } from 'node:buffer';

const BG = [2, 22, 15, 255]; // ירוק כהה מאוד
const BALL = [255, 255, 255, 255];
const SPOT = [15, 23, 42, 255]; // כתמי הכדור

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
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const src = (y * size + x) * 4;
      const dst = y * (size * 4 + 1) + 1 + x * 4;
      raw[dst] = pixels[src];
      raw[dst + 1] = pixels[src + 1];
      raw[dst + 2] = pixels[src + 2];
      raw[dst + 3] = pixels[src + 3];
    }
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

/** כדורגל פשוט: רקע כהה, כדור לבן, וכתמים כהים */
function drawIcon(size, { padding }) {
  const px = Buffer.alloc(size * size * 4);
  const put = (x, y, color) => {
    const i = (y * size + x) * 4;
    px[i] = color[0];
    px[i + 1] = color[1];
    px[i + 2] = color[2];
    px[i + 3] = color[3];
  };

  const cx = size / 2;
  const cy = size / 2;
  const ballR = size * (0.5 - padding);
  const spotR = ballR * 0.2;

  // מרכזי הכתמים: אחד במרכז וחמישה סביבו
  const spots = [[cx, cy]];
  for (let i = 0; i < 5; i++) {
    const a = (Math.PI * 2 * i) / 5 - Math.PI / 2;
    spots.push([cx + Math.cos(a) * ballR * 0.62, cy + Math.sin(a) * ballR * 0.62]);
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - cx + 0.5, y - cy + 0.5);
      let color = BG;
      if (d <= ballR) {
        color = BALL;
        for (const [sx, sy] of spots) {
          if (Math.hypot(x - sx + 0.5, y - sy + 0.5) <= spotR) {
            color = SPOT;
            break;
          }
        }
      }
      put(x, y, color);
    }
  }
  return px;
}

mkdirSync('public/icons', { recursive: true });

const targets = [
  // maskable צריך שוליים גדולים יותר, כי אנדרואיד חותך את הפינות
  { file: 'public/icons/icon-192.png', size: 192, padding: 0.08 },
  { file: 'public/icons/icon-512.png', size: 512, padding: 0.08 },
  { file: 'public/icons/maskable-512.png', size: 512, padding: 0.2 },
  { file: 'public/icons/apple-touch-icon.png', size: 180, padding: 0.08 },
];

for (const { file, size, padding } of targets) {
  writeFileSync(file, encodePng(size, drawIcon(size, { padding })));
  console.log('wrote', file, size + 'px');
}
