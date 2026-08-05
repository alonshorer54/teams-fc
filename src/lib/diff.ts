import { TEAM_IDS, TEAM_META, type Lineup, type Player, type TeamId } from '../types';
import { describeBonds } from './balance';
import { penaltyBreakdown, type CriterionSetting, type CriterionId } from './criteria';

export interface MovedPlayer {
  id: string;
  name: string;
  from: TeamId;
  to: TeamId;
}

export interface LineupIssue {
  /** warn = נוצרה בעיה · good = משהו דווקא השתפר */
  kind: 'warn' | 'good';
  text: string;
}

export interface CriterionDelta {
  id: CriterionId;
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
  TEAM_IDS.find((t) => lineup[t].includes(id)) ?? null;

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

  const criteria: CriterionDelta[] = priorities
    .filter((p) => p.enabled)
    .map((p) => ({
      id: p.id,
      before: before.get(p.id) ?? 0,
      after: after.get(p.id) ?? 0,
      delta: (after.get(p.id) ?? 0) - (before.get(p.id) ?? 0),
    }));

  /* קשרים שנשברו או תוקנו */
  const issues: LineupIssue[] = [];

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
        kind: 'warn',
        text:
          b.kind === 'hate'
            ? `${names} מעדיפים לא לשחק יחד — ועכשיו הם באותה קבוצה`
            : b.kind === 'friend'
              ? `${names} חברים — והופרדו`
              : `${names} מעדיפים לשחק יחד — והופרדו`,
      });
    } else if (!was && now) {
      issues.push({
        kind: 'good',
        text:
          b.kind === 'hate'
            ? `${names} כבר לא באותה קבוצה — טוב`
            : `${names} חזרו לשחק יחד`,
      });
    }
  }

  /* איזון הדירוג */
  const spreadOf = (lineup: Lineup) => {
    const avgs = TEAM_IDS.filter((t) => lineup[t].length).map((t) => {
      const members = lineup[t];
      return members.reduce((s, id) => s + (ratingOf.get(id) ?? 0), 0) / members.length;
    });
    return avgs.length ? Math.max(...avgs) - Math.min(...avgs) : 0;
  };
  const spreadBefore = spreadOf(baseline);
  const spreadAfter = spreadOf(current);

  if (spreadAfter - spreadBefore > 0.05) {
    issues.push({
      kind: 'warn',
      text: `פער הדירוג בין הקבוצות גדל מ-${spreadBefore.toFixed(2)} ל-${spreadAfter.toFixed(2)} לשחקן`,
    });
  } else if (spreadBefore - spreadAfter > 0.05) {
    issues.push({
      kind: 'good',
      text: `פער הדירוג הצטמצם ל-${spreadAfter.toFixed(2)} לשחקן`,
    });
  }

  /* גדלי קבוצות */
  const sizes = TEAM_IDS.map((t) => current[t].length);
  const sizesBefore = TEAM_IDS.map((t) => baseline[t].length);
  const uneven = Math.max(...sizes) - Math.min(...sizes) > 1;
  const wasUneven = Math.max(...sizesBefore) - Math.min(...sizesBefore) > 1;
  if (uneven && !wasUneven) {
    issues.push({
      kind: 'warn',
      text: `הקבוצות כבר לא בגדלים דומים (${sizes.join(' / ')}) — שחקן אחד עבר בלי החלפה`,
    });
  }

  /* ריכוז תגיות */
  const tags = [...new Set(pool.flatMap((p) => p.tags))];
  for (const tag of tags) {
    const countIn = (lineup: Lineup, t: TeamId) =>
      lineup[t].filter((id) => byId.get(id)?.tags.includes(tag)).length;
    const holders = pool.filter((p) => p.tags.includes(tag)).length;
    if (holders < 3) continue; // פחות מזה אין באמת מה לפזר

    const worstNow = Math.max(...TEAM_IDS.map((t) => countIn(current, t)));
    const worstBefore = Math.max(...TEAM_IDS.map((t) => countIn(baseline, t)));
    if (worstNow > worstBefore) {
      const team = TEAM_IDS.find((t) => countIn(current, t) === worstNow)!;
      issues.push({
        kind: 'warn',
        text: `${worstNow} שחקנים עם "${tag}" נמצאים עכשיו ב${TEAM_META[team].name}`,
      });
    }
  }

  return {
    changed: moved.length > 0,
    moved,
    criteria,
    issues,
    unevenSizes: uneven ? sizes : null,
  };
}
