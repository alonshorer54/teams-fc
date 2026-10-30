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

/**
 * "כללי" — כל עמדות השדה, אבל לא השער. רק מי שסומן כשוער נחשב שוער: אחרת
 * המערך היה שולח מישהו לשער רק כי לא סימנו לו עמדה.
 */
export const ANY_MASK = ALL_MASK & ~(1 << SPREAD_POSITIONS.indexOf('gk'));

/** העמדות שהשחקן יכול לעמוד בהן, כמסכת ביטים. */
export function positionMask(positions: readonly Position[]): number {
  let mask = 0;
  for (const p of positions) {
    if (p === 'any') return ANY_MASK;
    mask |= 1 << SPREAD_POSITIONS.indexOf(p);
  }
  return mask || ANY_MASK;
}

/** עמדות השדה של שחקן כרשימה — "כללי" הוא כל שלוש */
const ownPositions = (positions: readonly Position[]): FieldPosition[] => {
  const own = positions.filter((p): p is FieldPosition => p !== 'any');
  return own.length ? own : ['def', 'mid', 'att'];
};

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

/** איפה שחקן עומד במערך, והאם זו העמדה שלו */
export interface Spot {
  id: string;
  position: FieldPosition;
  fits: boolean;
}

export interface FormationFit {
  formation: Formation;
  /** כמה מכל עמדה מאוישים בשחקן שזו העמדה שלו */
  filled: Formation;
  /** כמה שחקנים משחקים בעמדה שהיא לא שלהם */
  outOfPlace: number;
  /** כל שחקן והמשבצת שלו, לפי סדר הקלט */
  spots: Spot[];
  /** אין בקבוצה שוער מסומן — השער מוצג כ"מתחלפים", ואף אחד לא מוצג כשוער */
  rotatingGoal: boolean;
}

/** מיקום כל עמדה לאורך המגרש — כדי שחלוץ עודף יירד לקישור ולא להגנה, ושחקן שדה לא יעמוד בשער */
const DEPTH: Record<FieldPosition, number> = { gk: -2, def: 0, mid: 1, att: 2 };

/**
 * שיבוץ בעלות מינימלית (האלגוריתם ההונגרי), למטריצה ריבועית.
 * מחזיר לכל שורה את העמודה שלה. הקבוצות קטנות, אז O(n³) זניח.
 */
function assign(cost: number[][]): number[] {
  const n = cost.length;
  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(n + 1).fill(0);
  const p = new Array<number>(n + 1).fill(0);
  const way = new Array<number>(n + 1).fill(0);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array<number>(n + 1).fill(Infinity);
    const used = new Array<boolean>(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }

  const columnOf = new Array<number>(n);
  for (let j = 1; j <= n; j++) if (p[j]) columnOf[p[j] - 1] = j - 1;
  return columnOf;
}

/**
 * איך הקבוצה עומדת על המגרש: כל שחקן מקבל משבצת במערך. קודם כמה שיותר שחקנים
 * בעמדה שלהם, ומי שנשאר בלי — למשבצת הכי קרובה לעמדה שלו. לתצוגה; לחיפוש
 * מספיק `fittedCount`.
 */
export function fitFormation(
  members: readonly { id: string; positions: readonly Position[] }[],
): FormationFit {
  const formation = formationFor(members.length);
  const slotType = formationSlots(formation).flatMap((n, type) =>
    Array<FieldPosition>(n).fill(SPREAD_POSITIONS[type] as FieldPosition),
  );
  const masks = members.map((m) => positionMask(m.positions));
  const fitsIn = (player: number, slot: FieldPosition) =>
    !!(masks[player] & (1 << SPREAD_POSITIONS.indexOf(slot)));

  // שחקן לא במקום עולה תמיד יותר מכל המרחקים יחד, כך שמספר הלא-במקום הוא המינימום
  const distance = (positions: readonly Position[], slot: FieldPosition) =>
    Math.min(...ownPositions(positions).map((pos) => Math.abs(DEPTH[pos] - DEPTH[slot])));
  const cost = members.map((m, player) =>
    slotType.map((slot) => (fitsIn(player, slot) ? 0 : 100 + distance(m.positions, slot))),
  );
  const slotOf = members.length ? assign(cost) : [];

  let rotatingGoal = false;
  const filled: Formation = { gk: 0, def: 0, mid: 0, att: 0 };
  const spots = members.map((m, player) => {
    let position = slotType[slotOf[player]];
    // בלי שוער מסומן אף אחד לא "נשלח" לשער: מי שקיבל את המשבצת חוזר לשורה
    // שלו בשדה, והשער מוצג כמתחלף
    if (position === 'gk' && !fitsIn(player, 'gk')) {
      rotatingGoal = true;
      position = ownPositions(m.positions).reduce((best, pos) =>
        distance([pos], 'gk') < distance([best], 'gk') ? pos : best,
      );
    }
    const fits = fitsIn(player, position);
    if (fits) filled[position]++;
    return { id: m.id, position, fits };
  });
  return {
    formation,
    filled,
    outOfPlace: spots.filter((s) => !s.fits).length,
    spots,
    rotatingGoal,
  };
}
