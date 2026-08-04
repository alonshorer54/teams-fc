import type { Player } from '../types';

export interface ParsedLine {
  /** הטקסט כפי שהופיע ברשימה שהודבקה */
  raw: string;
  /** השחקן שזוהה, אם זוהה */
  player: Player | null;
  /** האם ההתאמה הייתה מדויקת או לפי שם פרטי בלבד */
  exact: boolean;
}

export interface ParseResult {
  matched: ParsedLine[];
  unmatched: ParsedLine[];
  /** שורות שיש להן יותר מהתאמה אפשרית אחת — דורשות הכרעה ידנית */
  ambiguous: { raw: string; options: Player[] }[];
}

/** ניקוד וטעמים בעברית */
const HEBREW_MARKS = /[֑-ׇ]/g;
/** אמוג'י, ZWJ, variation selector ו-keycap */
// אלטרנציה ולא מחלקת תווים — מצרפים אינם חוקיים בתוך [...] לפי כללי הלינטר
const EMOJI = /\p{Extended_Pictographic}|\u200D|\uFE0F|\u20E3/gu;

/** מסיר ניקוד, אמוג'י, סימני רשימה ומספור — ומשאיר רק את השם. */
function clean(line: string): string {
  return line
    .replace(HEBREW_MARKS, '')
    .replace(EMOJI, '')
    .replace(/^[\s\-–—*•·.)\]}>]+/, '') // תווי רשימה בתחילת השורה
    .replace(/^\d+\s*[.)\-:]?\s*/, '') // מספור: "1." / "1)" / "1 -"
    .replace(/[\s\-–—*•·.,:;!?)\]}>]+$/, '') // סימני פיסוק בסוף
    .replace(/\s+/g, ' ')
    .trim();
}

const firstName = (name: string) => clean(name).split(' ')[0] ?? '';

/**
 * מפרק טקסט שהודבק (סקר וואטסאפ, רשימה מהקבוצה) ומתאים אותו לשחקנים במאגר.
 * מזהה שם מלא, ואם אין — שם פרטי, כל עוד הוא ייחודי.
 */
export function parseNameList(text: string, players: Player[]): ParseResult {
  const lines = text
    .split(/[\n,;|]+/)
    .map(clean)
    .filter((l) => l.length > 1);

  const seen = new Set<string>();
  const matched: ParsedLine[] = [];
  const unmatched: ParsedLine[] = [];
  const ambiguous: { raw: string; options: Player[] }[] = [];

  for (const raw of lines) {
    const key = raw.toLowerCase();
    if (seen.has(key)) continue; // אותו שם הופיע פעמיים ברשימה
    seen.add(key);

    const exactHit = players.find((p) => clean(p.name).toLowerCase() === key);
    if (exactHit) {
      matched.push({ raw, player: exactHit, exact: true });
      continue;
    }

    // התאמה לפי שם פרטי, או לפי הכלה (למשל "יוסי כ" מול "יוסי כהן")
    const candidates = players.filter((p) => {
      const full = clean(p.name).toLowerCase();
      return firstName(p.name).toLowerCase() === key || full.startsWith(key) || full.includes(key);
    });

    if (candidates.length === 1) {
      matched.push({ raw, player: candidates[0], exact: false });
    } else if (candidates.length > 1) {
      ambiguous.push({ raw, options: candidates });
    } else {
      unmatched.push({ raw, player: null, exact: false });
    }
  }

  return { matched, unmatched, ambiguous };
}
