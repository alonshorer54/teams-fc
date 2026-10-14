import {
  POSITION_META,
  SPREAD_POSITIONS,
  TEAM_META,
  lineupTeams,
  membersOf,
  type DrawConstraint,
  type Lineup,
  type Player,
  type TeamId,
} from '../types';
import { BALANCE_GRADES, balanceLevel, constraintMet, describeBonds } from './balance';
import {
  penaltyBreakdown,
  tiersPenalty,
  type CriterionSetting,
  type ScoreId,
} from './criteria';

export interface MovedPlayer {
  id: string;
  name: string;
  from: TeamId;
  to: TeamId;
}

/**
 * בעיה שעריכה ידנית יצרה. מה שמשפיע על המשחק עצמו — עמדות, איזון, גדלים
 * ואילוצי השבוע — מוצג במלואו. קשרים בין שחקנים מסומנים כמשניים ונספרים
 * בשורה אחת בלבד: עם 8 שחקנים שהוזזו הם הציפו את המסך והסתירו את העיקר.
 */
export interface LineupIssue {
  text: string;
  minor?: boolean;
}

export interface CriterionDelta {
  id: ScoreId;
  before: number;
  after: number;
  delta: number;
}

export interface LineupDiff {
  changed: boolean;
  moved: MovedPlayer[];
  criteria: CriterionDelta[];
  issues: LineupIssue[];
  /** גדלי הקבוצות אחרי השינוי, אם הם כבר לא שווים */
  unevenSizes: number[] | null;
}

const teamOf = (lineup: Lineup, id: string): TeamId | null =>
  lineupTeams(lineup).find((t) => membersOf(lineup, t).includes(id)) ?? null;

const bondKey = (kind: string, a: string, b: string) => `${kind}:${[a, b].sort().join('|')}`;

/**
 * משווה בין ההגרלה המקורית לבין המצב הנוכחי אחרי עריכות ידניות,
 * ומסביר בשפה פשוטה מה נשבר ומה השתפר.
 */
export function compareLineups(
  baseline: Lineup,
  current: Lineup,
  pool: Player[],
  pairEffects: Map<string, number>,
  priorities: CriterionSetting[],
  /** אילוצי השבוע — אילוץ שעריכה ידנית הפרה הוא הבעיה הראשונה שמדווחת */
  constraints: DrawConstraint[] = [],
): LineupDiff {
  const byId = new Map(pool.map((p) => [p.id, p]));
  const ratingOf = new Map(pool.map((p) => [p.id, p.rating]));

  /* מי זז */
  const moved: MovedPlayer[] = [];
  for (const p of pool) {
    const from = teamOf(baseline, p.id);
    const to = teamOf(current, p.id);
    if (from && to && from !== to) moved.push({ id: p.id, name: p.name, from, to });
  }

  /* ציון לכל קריטריון, לפני ואחרי */
  const scoreOf = (lineup: Lineup) =>
    new Map(
      penaltyBreakdown({ lineup, pool, ratingOf, pairEffects }, priorities).map((b) => [
        b.id,
        b.score,
      ]),
    );
  const before = scoreOf(baseline);
  const after = scoreOf(current);
  const tiersScore = (lineup: Lineup) =>
    Math.round((1 - tiersPenalty({ lineup, pool, ratingOf, pairEffects })) * 100);

  // פיזור הרמות תמיד פעיל, ולכן תמיד נמדד — ובא ראשון, כמו בשורת הציונים
  const tiersBefore = tiersScore(baseline);
  const tiersAfter = tiersScore(current);
  const criteria: CriterionDelta[] = [
    { id: 'tiers', before: tiersBefore, after: tiersAfter, delta: tiersAfter - tiersBefore },
    ...priorities
      .filter((p) => p.enabled)
      .map((p) => ({
        id: p.id,
        before: before.get(p.id) ?? 0,
        after: after.get(p.id) ?? 0,
        delta: (after.get(p.id) ?? 0) - (before.get(p.id) ?? 0),
      })),
  ];

  const issues: LineupIssue[] = [];

  /* אילוצי השבוע */
  const teamMapOf = (lineup: Lineup) => {
    const map = new Map<string, TeamId>();
    for (const t of lineupTeams(lineup)) for (const id of membersOf(lineup, t)) map.set(id, t);
    return map;
  };
  const teamsBefore = teamMapOf(baseline);
  const teamsAfter = teamMapOf(current);
  for (const c of constraints) {
    const a = byId.get(c.aId)?.name;
    const b = byId.get(c.bId)?.name;
    if (!a || !b) continue;
    const was = constraintMet(c, teamsBefore);
    const now = constraintMet(c, teamsAfter);
    if (was && !now) {
      issues.push({
        text:
          c.kind === 'together'
            ? `${a} ו${b} חייבים לשחק יחד השבוע — והופרדו`
            : `${a} ו${b} חייבים להיות בנפרד השבוע — ועכשיו הם באותה קבוצה`,
      });
    }
  }

  /* קשרים שנשברו */

  const satisfied = (lineup: Lineup) => {
    const map = new Map<string, boolean>();
    for (const b of describeBonds(lineup, pool)) {
      const ok = b.kind === 'hate' ? !b.together : b.together;
      map.set(bondKey(b.kind, b.aId, b.bId), ok);
    }
    return map;
  };
  const bondsBefore = satisfied(baseline);
  const bondsAfter = satisfied(current);

  for (const b of describeBonds(current, pool)) {
    const key = bondKey(b.kind, b.aId, b.bId);
    const was = bondsBefore.get(key);
    const now = bondsAfter.get(key);
    if (was === now) continue;

    const names = `${b.aName} ו${b.bName}`;
    if (was && !now) {
      issues.push({
        minor: true,
        text:
          b.kind === 'hate'
            ? `${names} מעדיפים לא לשחק יחד — ועכשיו הם באותה קבוצה`
            : b.kind === 'friend'
              ? `${names} חברים — והופרדו`
              : `${names} מעדיפים לשחק יחד — והופרדו`,
      });
    }
  }

  /* איזון הדירוג */
  const spreadOf = (lineup: Lineup) => {
    const avgs = lineupTeams(lineup)
      .map((t) => membersOf(lineup, t))
      .filter((members) => members.length)
      .map((members) => members.reduce((s, id) => s + (ratingOf.get(id) ?? 0), 0) / members.length);
    return avgs.length ? Math.max(...avgs) - Math.min(...avgs) : 0;
  };
  const spreadBefore = spreadOf(baseline);
  const spreadAfter = spreadOf(current);

  // פער שגדל מ-0.01 ל-0.07 עדיין "איזון מצוין" — מזהירים רק כשהאיזון יורד דרגה,
  // ולא על מעבר זעיר שבמקרה חוצה את הסף (0.10 ל-0.11)
  const levelBefore = balanceLevel(spreadBefore);
  const levelAfter = balanceLevel(spreadAfter);
  if (levelAfter > levelBefore && spreadAfter - spreadBefore > 0.05) {
    issues.push({
      text: `איזון ${BALANCE_GRADES[levelAfter]} במקום ${BALANCE_GRADES[levelBefore]} — פער הדירוג גדל מ-${spreadBefore.toFixed(2)} ל-${spreadAfter.toFixed(2)} לשחקן`,
    });
  }

  /* גדלי קבוצות */
  const sizes = lineupTeams(current).map((t) => membersOf(current, t).length);
  const sizesBefore = lineupTeams(baseline).map((t) => membersOf(baseline, t).length);
  const uneven = Math.max(...sizes) - Math.min(...sizes) > 1;
  const wasUneven = Math.max(...sizesBefore) - Math.min(...sizesBefore) > 1;
  if (uneven && !wasUneven) {
    issues.push({
      text: `הקבוצות כבר לא בגדלים דומים (${sizes.join(' / ')}) — שחקן אחד עבר בלי החלפה`,
    });
  }

  /* ריכוז עמדות */
  let positionWarned = false;
  for (const position of SPREAD_POSITIONS) {
    const countIn = (lineup: Lineup, t: TeamId) =>
      membersOf(lineup, t).filter((id) => byId.get(id)?.positions.join() === position).length;
    // רק מי שזו העמדה היחידה שלו: שחקן גמיש ממלא את מה שחסר, אז הוא לא "מצטופף"
    const holders = pool.filter((p) => p.positions.join() === position).length;
    // שני שוערים באותה קבוצה כבר בעיה; בשאר העמדות פחות משלושה אין באמת מה לפזר
    if (holders < (position === 'gk' ? 2 : 3)) continue;

    const worstNow = Math.max(...lineupTeams(current).map((t) => countIn(current, t)), 0);
    const worstBefore = Math.max(...lineupTeams(baseline).map((t) => countIn(baseline, t)), 0);
    // 7 שחקני הגנה ב-3 קבוצות — 3 באחת מהן זו החלוקה הכי שווה שיש, לא בעיה
    const fairShare = Math.ceil(holders / lineupTeams(current).length);
    if (worstNow > worstBefore && worstNow > fairShare) {
      const team = lineupTeams(current).find((t) => countIn(current, t) === worstNow)!;
      issues.push({
        text: `${worstNow} שחקני ${POSITION_META[position].label} נמצאים עכשיו ב${TEAM_META[team].name}`,
      });
      positionWarned = true;
    }
  }

  // הספירה למעלה רואה רק שחקני עמדה אחת. שחקני הגנה/קישור שהצטופפו נתפסים
  // רק בציון העמדות, ובלי זה עריכה כזו הייתה עוברת כ"אין בעיות"
  const positionsScore = criteria.find((c) => c.id === 'positions');
  if (!positionWarned && positionsScore && positionsScore.delta <= -10) {
    issues.push({
      text: `סידור העמדות נפגע — הציון ירד מ-${positionsScore.before} ל-${positionsScore.after}`,
    });
  }

  return {
    changed: moved.length > 0,
    moved,
    criteria,
    issues,
    unevenSizes: uneven ? sizes : null,
  };
}
