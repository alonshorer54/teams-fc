import type { Player } from '../types';

export interface ParsedLine {
  /** הטקסט כפי שהופיע ברשימה שהודבקה */
  raw: string;
  /** השחקן שזוהה */
  player: Player;
  /** האם ההתאמה הייתה מדויקת או לפי חלק מהשם */
  exact: boolean;
}

export interface ParseResult {
  matched: ParsedLine[];
  /** שורות שיש להן יותר מהתאמה אפשרית אחת — דורשות הכרעה ידנית */
  ambiguous: { raw: string; options: Player[] }[];
  /** שורות בלי התאמה — עם השמות הכי קרובים במאגר, אם יש כאלה */
  unmatched: { raw: string; suggestions: Player[] }[];
  /** מה שדולג: כותרות ("כדורגל ברביעי ב20:30:") ומי שברשימת ההמתנה */
  skipped: { headers: string[]; waiting: string[] };
}

/** ניקוד וטעמים בעברית */
const HEBREW_MARKS = /[֑-ׇ]/g;
/** אמוג'י, ZWJ, variation selector ו-keycap */
// אלטרנציה ולא מחלקת תווים — מצרפים אינם חוקיים בתוך [...] לפי כללי הלינטר
const EMOJI = /\p{Extended_Pictographic}|‍|️|⃣/gu;
/** תווים בלתי נראים שוואטסאפ משתיל, למשל ה-word joiner ב"8. ⁠אביתר" */
const INVISIBLE = /[​‌‎‏‪-‮⁠-⁤﻿]/g;

const NUMBERED = /^\s*\d+\s*[.)\-:]?\s*/;
/** כותרת של רשימת המתנה — מכאן והלאה אף אחד לא משחק */
const WAITING = /^(רשימת\s+)?(ממתינים|ממתין|המתנה|מחכים|ספסל|רזרב|מילואים)/;

/** מסיר ניקוד, אמוג'י, סימני רשימה ומספור — ומשאיר רק את השם. */
function clean(line: string): string {
  return line
    .replace(INVISIBLE, '')
    .replace(HEBREW_MARKS, '')
    .replace(EMOJI, '')
    .replace(/^[\s\-–—*•·.)\]}>]+/, '') // תווי רשימה בתחילת השורה
    .replace(NUMBERED, '') // מספור: "1." / "1)" / "1 -"
    .replace(/^[\s\-–—*•·.)\]}>]+/, '') // "7. - שי" — סימן רשימה אחרי המספר
    .replace(/[\s\-–—*•·.,:;!?)\]}>]+$/, '') // סימני פיסוק בסוף
    .replace(/\s+/g, ' ')
    .trim();
}

const FINAL_LETTERS: Record<string, string> = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' };

/**
 * הצורה שמשווים לפיה: בלי מקפים, גרשיים וסוגריים, ובלי אותיות סופיות.
 * כך "אופק סייג בת ים" פוגש את "אופק סייג - בת ים" שבמאגר.
 */
function key(name: string): string {
  return clean(name)
    .replace(/["'׳״`]/g, '')
    .replace(/[-–—_.,/\\()[\]]+/g, ' ')
    .replace(/[ךםןףץ]/g, (c) => FINAL_LETTERS[c])
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const tokensOf = (k: string) => k.split(' ').filter(Boolean);

/**
 * כל מילה ב-a מופיעה ב-b. עם `prefix` המילה האחרונה מספיקה כהתחלה — "יוסי כ" מול
 * "יוסי כהן" — אבל רק לכיוון של מה שהודבק, אחרת "בר" במאגר היה תופס כל "ברק".
 */
function tokensWithin(a: string[], b: string[], prefix: boolean): boolean {
  return a.every(
    (t, i) => b.includes(t) || (prefix && i === a.length - 1 && b.some((w) => w.startsWith(t))),
  );
}

function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = temp;
    }
  }
  return row[b.length];
}

const similarity = (a: string, b: string) =>
  a && b ? 1 - levenshtein(a, b) / Math.max(a.length, b.length) : 0;

/**
 * כמה השם שהודבק דומה לשם שבמאגר, בין 0 ל-1. לכל מילה שהודבקה לוקחים את
 * המילה הכי דומה אצל השחקן, כדי ששגיאת כתיב או סדר מילים הפוך לא יפילו התאמה.
 */
function closeness(rawKey: string, playerKey: string): number {
  const raw = tokensOf(rawKey);
  const own = tokensOf(playerKey);
  if (!raw.length || !own.length) return 0;
  const perToken =
    raw.reduce((s, t) => s + Math.max(...own.map((w) => similarity(t, w))), 0) / raw.length;
  return Math.max(perToken, similarity(rawKey, playerKey));
}

/** מתחת לזה ההצעה היא ניחוש ולא עזרה */
const SUGGESTION_FLOOR = 0.5;
const MAX_SUGGESTIONS = 3;

/**
 * מפריד את השורות שהודבקו לשמות של מי שמשחק, ומדלג על כותרות ועל רשימת
 * ההמתנה. כשיש ברשימה שורות ממוספרות, רק הן נחשבות — כל השאר הוא כותרת.
 */
function extractNames(text: string): { names: string[]; skipped: ParseResult['skipped'] } {
  const headers: string[] = [];
  const waiting: string[] = [];
  const main: { text: string; numbered: boolean }[] = [];
  let inWaiting = false;

  for (const line of text.split(/\r?\n/)) {
    const bare = line.replace(INVISIBLE, '').trim();
    if (!bare) continue;
    const numbered = /^\d/.test(bare);
    const name = clean(bare);

    if (!numbered && WAITING.test(name)) {
      inWaiting = true;
      continue;
    }
    if (inWaiting) {
      if (name.length > 1) waiting.push(name);
      continue;
    }
    // שורה לא ממוספרת שנגמרת בנקודתיים היא כותרת, לא שם
    if (!numbered && /[:：]\s*$/.test(bare.replace(EMOJI, ''))) {
      if (name) headers.push(name);
      continue;
    }
    main.push({ text: bare, numbered });
  }

  const anyNumbered = main.some((l) => l.numbered);
  const names: string[] = [];
  for (const l of main) {
    if (anyNumbered && !l.numbered) {
      const name = clean(l.text);
      if (name) headers.push(name);
      continue;
    }
    // שורה ממוספרת היא שם אחד; בלי מספור אפשר גם "דני, יוסי, משה"
    const parts = l.numbered ? [l.text] : l.text.split(/[,;|]+/);
    for (const part of parts) {
      const name = clean(part);
      // "20:30" לבד בשורה הוא לא שם
      if (name.length > 1 && /\p{L}/u.test(name)) names.push(name);
    }
  }
  return { names, skipped: { headers, waiting } };
}

/**
 * מפרק טקסט שהודבק (סקר וואטסאפ, רשימה מהקבוצה) ומתאים אותו לשחקנים במאגר.
 * מזהה שם מלא גם עם מקף או סדר אחר, ואם אין — חלק מהשם, כל עוד הוא ייחודי.
 * מי שלא זוהה מקבל את השמות הכי קרובים במאגר.
 */
export function parseNameList(text: string, players: Player[]): ParseResult {
  const { names, skipped } = extractNames(text);
  const keyed = players.map((p) => ({ player: p, key: key(p.name) }));

  const matched: ParsedLine[] = [];
  const ambiguous: ParseResult['ambiguous'] = [];
  const unmatched: ParseResult['unmatched'] = [];

  // קודם ההתאמות המדויקות, כדי שמי שכבר זוהה לא יופיע כאפשרות לשורה אחרת:
  // "יואב" ברשימה שיש בה גם "יואב לוי" הוא כנראה יואב השני
  const seen = new Set<string>();
  const rest: { raw: string; key: string }[] = [];
  const taken = new Set<string>();
  for (const raw of names) {
    const k = key(raw);
    if (!k || seen.has(k)) continue; // אותו שם הופיע פעמיים ברשימה
    seen.add(k);
    const hits = keyed.filter((e) => e.key === k);
    if (hits.length === 1) {
      matched.push({ raw, player: hits[0].player, exact: true });
      taken.add(hits[0].player.id);
    } else {
      rest.push({ raw, key: k });
    }
  }

  for (const { raw, key: k } of rest) {
    const words = tokensOf(k);
    const free = keyed.filter((e) => !taken.has(e.player.id));
    // "אליאור" מול "אליאור כהן", או "אופק סייג בת ים" מול "אופק סייג"
    const candidates = free.filter((e) => {
      const own = tokensOf(e.key);
      return tokensWithin(words, own, true) || tokensWithin(own, words, false);
    });

    if (candidates.length === 1) {
      matched.push({ raw, player: candidates[0].player, exact: false });
      taken.add(candidates[0].player.id);
    } else if (candidates.length > 1) {
      ambiguous.push({
        raw,
        options: candidates.map((c) => c.player).sort((a, b) => a.name.localeCompare(b.name, 'he')),
      });
    } else {
      const suggestions = free
        .map((e) => ({ player: e.player, score: closeness(k, e.key) }))
        .filter((s) => s.score >= SUGGESTION_FLOOR)
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_SUGGESTIONS)
        .map((s) => s.player);
      unmatched.push({ raw, suggestions });
    }
  }

  // בסדר של הרשימה, ולא קודם המדויקים
  const order = (raw: string) => names.indexOf(raw);
  matched.sort((a, b) => order(a.raw) - order(b.raw));

  return { matched, ambiguous, unmatched, skipped };
}
