import { SPREAD_POSITIONS, type Position } from '../types';

/** עמדה על המגרש. "כללי" הוא לא עמדה — הוא מי שיכול לעמוד בכל אחת מהן. */
export type FieldPosition = Exclude<Position, 'any'>;

/** כמה שחקנים עומדים בכל עמדה */
export type Formation = Record<FieldPosition, number>;

/**
 * הגנה / קישור / התקפה לפי מספר השחקנים בשדה (בלי השוער).
 * 7 בקבוצה = שוער + 3-2-1; 5 בקבוצה = שוער + 2-0-2, כי בקבוצה קטנה אין קישור.
 */
const OUTFIELD: readonly (readonly [number, number, number])[] = [
  [0, 0, 0],
  [1, 0, 0],
  [1, 0, 1],
  [2, 0, 1],
  [2, 0, 2],
  [2, 2, 1],
  [3, 2, 1],
  [3, 3, 1],
  [3, 3, 2],
  [4, 3, 2],
  [4, 4, 2],
];

/** המערך של קבוצה בגודל הזה: תמיד שוער אחד, וסכום העמדות הוא גודל הקבוצה. */
export function formationFor(size: number): Formation {
  if (size <= 0) return { gk: 0, def: 0, mid: 0, att: 0 };
  const outfield = size - 1;
  const top = OUTFIELD.length - 1;
  const [def, mid, att] = OUTFIELD[Math.min(outfield, top)];
  // קבוצה גדולה מהטבלה — העודפים נכנסים לקישור
  return { gk: 1, def, mid: mid + Math.max(0, outfield - top), att };
}

/** "3-2-1" — הגנה, קישור, התקפה */
export const formationLabel = (f: Formation): string => `${f.def}-${f.mid}-${f.att}`;

/** כל העמדות יחד, כמסכת ביטים לפי הסדר של SPREAD_POSITIONS */
export const ALL_MASK = (1 << SPREAD_POSITIONS.length) - 1;

/** העמדות שהשחקן יכול לעמוד בהן, כמסכת ביטים. "כללי" עומד בכל מקום. */
export function positionMask(positions: readonly Position[]): number {
  let mask = 0;
  for (const p of positions) {
    if (p === 'any') return ALL_MASK;
    mask |= 1 << SPREAD_POSITIONS.indexOf(p);
  }
  return mask || ALL_MASK;
}

/** המערך כמערך מספרים, לפי הסדר של SPREAD_POSITIONS */
export const formationSlots = (f: Formation): number[] =>
  SPREAD_POSITIONS.map((p) => f[p as FieldPosition]);

/**
 * כמה שחקנים אפשר להעמיד בעמדה שלהם, לכל היותר.
 *
 * זה שיבוץ מקסימלי של שחקנים לעמדות, ומחושב דרך החתך המינימלי: עם ארבע עמדות
 * יש רק 16 תת-קבוצות לבדוק, וזה זול מספיק ללולאה הפנימית של החיפוש — הרבה יותר
 * מלחפש שיבוץ בפועל. `byMask[m]` = כמה שחקנים יכולים לעמוד בדיוק בעמדות של m.
 */
export function fittedCount(byMask: ArrayLike<number>, slots: readonly number[]): number {
  // בקבוצה יש רק כמה צירופי עמדות שונים, אז לא סורקים את כל ה-16 בכל חתך
  const masks: number[] = [];
  for (let m = 1; m <= ALL_MASK; m++) if (byMask[m]) masks.push(m);

  let best = Infinity;
  for (let s = 0; s <= ALL_MASK; s++) {
    let cut = 0;
    for (let b = 0; b < slots.length; b++) if (s & (1 << b)) cut += slots[b];
    for (const m of masks) if (m & ~s) cut += byMask[m];
    if (cut < best) best = cut;
  }
  return best;
}

export interface FormationFit {
  formation: Formation;
  /** כמה מכל עמדה מאוישים בשחקן שזו העמדה שלו */
  filled: Formation;
  /** כמה שחקנים משחקים בעמדה שהיא לא שלהם */
  outOfPlace: number;
}

/**
 * איך הקבוצה עומדת על המגרש: שיבוץ בפועל של השחקנים למערך, כך שכמה שיותר
 * מהם בעמדה שלהם. לתצוגה — לחיפוש מספיק `fittedCount`.
 */
export function fitFormation(members: readonly Position[][]): FormationFit {
  const formation = formationFor(members.length);
  const slots = formationSlots(formation);
  // כל משבצת על המגרש, ומי עומד בה
  const slotType = slots.flatMap((n, type) => Array<number>(n).fill(type));
  const owner = new Array<number>(slotType.length).fill(-1);
  const masks = members.map(positionMask);

  const place = (player: number, seen: boolean[]): boolean => {
    for (let s = 0; s < slotType.length; s++) {
      if (seen[s] || !(masks[player] & (1 << slotType[s]))) continue;
      seen[s] = true;
      if (owner[s] === -1 || place(owner[s], seen)) {
        owner[s] = player;
        return true;
      }
    }
    return false;
  };

  let placed = 0;
  for (let p = 0; p < members.length; p++) {
    if (place(p, new Array<boolean>(slotType.length).fill(false))) placed++;
  }

  const filled: Formation = { gk: 0, def: 0, mid: 0, att: 0 };
  owner.forEach((player, s) => {
    if (player !== -1) filled[SPREAD_POSITIONS[slotType[s]] as FieldPosition]++;
  });
  return { formation, filled, outOfPlace: members.length - placed };
}
