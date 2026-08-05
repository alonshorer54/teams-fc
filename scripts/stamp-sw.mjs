// מטביע מזהה גרסה ב-service worker אחרי הבנייה.
// בלי זה שם המטמון קבוע, המטמון הישן לא נמחק לעולם, והוא רק תופח.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const swPath = 'dist/sw.js';

// המזהה נגזר משמות קבצי הבנייה — משתנה רק כשבאמת יצא build חדש
const assets = readdirSync('dist/assets').sort().join('|');
const buildId = createHash('sha256').update(assets).digest('hex').slice(0, 10);

const sw = readFileSync(swPath, 'utf8').replaceAll('__BUILD_ID__', buildId);
writeFileSync(swPath, sw);

console.log(`service worker stamped with build ${buildId}`);
