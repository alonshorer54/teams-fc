import { useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  ChevronDown,
  Link2,
  Save,
  Scale,
  Shuffle,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Users,
} from 'lucide-react';
import {
  TEAM_META,
  defaultTeamIds,
  emptyLineup,
  fillerAsPlayer,
  lineupTeams,
  membersOf,
  recolorTeam,
  teamGridClass,
  teamsIn,
  type Lineup,
  type Player,
  type SaveOutcome,
  type TeamId,
} from '../types';
import {
  BALANCE_GRADES,
  balanceLevel,
  addToTeam,
  computeStats,
  describeBonds,
  findTeamOf,
  generateLineup,
  keepOnly,
  movePlayer,
  recentPairWeights,
  replaceInLineup,
  smallestTeam,
  swapPlayers,
  teamSizeList,
} from '../lib/balance';
import {
  CRITERION_META,
  POSITIONS_META,
  TIERS_META,
  penaltyBreakdown,
  positionsPenalty,
  tiersPenalty,
  type CriterionId,
  type CriterionSetting,
} from '../lib/criteria';
import { compareLineups, type LineupDiff } from '../lib/diff';
import type { Draft, Substitution } from '../lib/storage';
import { EmptyState } from './ui';
import { RoundPanel } from './RoundPanel';
import type { NewPlayerDraft } from './PasteListModal';
import { FormatPanel } from './FormatPanel';
import { PrioritiesPanel } from './PrioritiesPanel';
import { ConstraintsPanel } from './ConstraintsPanel';
import { ChangeReport } from './ChangeReport';
import { ChangePopup } from './ChangePopup';
import { TeamCard, type TeamView } from './TeamCard';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { ShareView } from './ShareView';
import type { ShareFormations, ShareTeams } from '../lib/format';
import { formationLabel, type FieldPosition } from '../lib/formation';

type Mode = 'admin' | 'share';

/**
 * מחליף נכנס למחזור רק בזכות ההחלפה שלו. כשההחלפה מתבטלת או מוחלפת באחר, בלי
 * זה הוא נשאר ברשימת המשחקים בשקט — וכל שינוי מחליף או ביטול סימון היה מגדיל
 * את המניין באחד בלי שום סימן על המסך.
 */
function dropStaleReplacement(
  selectedIds: string[],
  staleInId: string | undefined,
  remaining: Substitution[],
) {
  // עדיין מחליף מישהו אחר — נשאר במחזור
  if (!staleInId || remaining.some((s) => s.inId === staleInId)) return selectedIds;
  return selectedIds.filter((x) => x !== staleInId);
}

/**
 * Carries a change to who's playing into teams that were already drawn. Without it the teams
 * kept whoever cancelled (and saved them as having played and owing money), while the
 * replacement and anyone added later were in no team at all.
 *
 * A replacement takes the exact spot of the player they replace; someone who comes back gets
 * their spot back from the replacement who left; anyone else new goes to the smallest team.
 * Players who left stay in the stored lineup but out of sight (see `keepOnly` in DrawView),
 * so a replacement chosen a minute later still finds their spot.
 */
function followRoster(prev: Draft, next: Draft): Draft {
  if (!next.lineup) return next;
  let lineup = next.lineup;
  let baseline = next.baseline;
  const both = (change: (l: Lineup) => Lineup) => {
    lineup = change(lineup);
    baseline = baseline && change(baseline);
  };

  for (const s of next.substitutions) {
    if (prev.substitutions.some((x) => x.outId === s.outId && x.inId === s.inId)) continue;
    // A replacement for the replacement takes over the spot the first one held — but only if
    // the first one is out of the round; one still replacing someone else keeps their spot
    const earlier = prev.substitutions.find((x) => x.outId === s.outId)?.inId;
    const earlierGone = !!earlier && !next.selectedIds.includes(earlier);
    const spot = earlierGone && findTeamOf(lineup, earlier) ? earlier : s.outId;
    both((l) => replaceInLineup(l, spot, s.inId));
  }

  const playing = new Set([...next.selectedIds, ...next.fillers.map((f) => f.id)]);
  for (const id of next.selectedIds) {
    if (findTeamOf(lineup, id)) continue;
    const stoodIn = prev.substitutions.find((x) => x.outId === id && !playing.has(x.inId))?.inId;
    if (stoodIn && findTeamOf(lineup, stoodIn)) {
      both((l) => replaceInLineup(l, stoodIn, id));
      continue;
    }
    const team = smallestTeam(keepOnly(lineup, playing));
    if (team) both((l) => addToTeam(l, id, team));
  }

  return { ...next, lineup, baseline };
}

export function DrawView({
  players,
  draft,
  setDraft,
  streaks,
  pairEffects,
  recentLineups,
  priorities,
  setPriorities,
  onSaveHistory,
  onListPasted,
  onAddPlayers,
  notify,
  isDemo,
}: {
  players: Player[];
  draft: Draft;
  setDraft: (updater: (prev: Draft) => Draft) => void;
  streaks: Map<string, number>;
  /** אפקטים נלמדים לזוגות, מתוך ההיסטוריה */
  pairEffects: Map<string, number>;
  /** ההרכבים האחרונים מההיסטוריה, מהחדש לישן */
  recentLineups: Lineup[];
  priorities: CriterionSetting[];
  setPriorities: (next: CriterionSetting[]) => void;
  onSaveHistory: (lineup: Lineup, date: string, cancelledIds: string[]) => SaveOutcome;
  /** רשימה מהוואטסאפ נקלטה — פותחים לה גבייה */
  onListPasted: (date: string, ids: string[]) => void;
  onAddPlayers: (drafts: NewPlayerDraft[]) => string[];
  notify: (msg: string) => void;
  isDemo: boolean;
}) {
  const [mode, setMode] = useState<Mode>('admin');
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  // העדפת תצוגה של המכשיר הזה בלבד — לא שייכת לנתוני הקבוצה ולא מסתנכרנת
  const [storedView, setTeamView] = useLocalStorage<TeamView>('kohot.teamView.v1', 'pitch');
  // ערך שמור לא מוכר לא אמור להשאיר את הכרטיס בלי אף אחת מהתצוגות
  const teamView: TeamView = storedView === 'list' ? 'list' : 'pitch';
  /** ההשפעה של הפעולה הידנית האחרונה, להודעה הקופצת */
  const [lastChange, setLastChange] = useState<{
    diff: LineupDiff;
    previous: Lineup;
    id: number;
  } | null>(null);
  const changeIdRef = useRef(0);

  const {
    selectedIds,
    cancelledIds,
    substitutions,
    matchDate,
    teamCount,
    fillers,
    constraints,
  } = draft;

  /**
   * הבריכה = מי שנבחר מהמאגר, ואחריו המשלימים.
   * המשלימים לובשים צורת שחקן רגיל, וכך כל האלגוריתם והתצוגה עובדים עליהם
   * בלי אף תנאי מיוחד.
   */
  const pool = useMemo(() => {
    const set = new Set(selectedIds);
    return [...players.filter((p) => set.has(p.id)), ...fillers.map(fillerAsPlayer)];
  }, [players, selectedIds, fillers]);

  // The teams as they stand: whoever left the round since the draw is out of them
  const poolIds = useMemo(() => new Set(pool.map((p) => p.id)), [pool]);
  const lineup = useMemo(
    () => (draft.lineup ? keepOnly(draft.lineup, poolIds) : null),
    [draft.lineup, poolIds],
  );
  const baseline = useMemo(
    () => (draft.baseline ? keepOnly(draft.baseline, poolIds) : null),
    [draft.baseline, poolIds],
  );
  /** Playing this round but in no team — joined after the draw in a way that didn't place them */
  const unplaced = useMemo(
    () => (lineup ? pool.filter((p) => !findTeamOf(lineup, p.id)) : []),
    [lineup, pool],
  );
  /** A change to who's playing, carried into the teams if they were already drawn */
  const setRoster = (change: (prev: typeof draft) => typeof draft) =>
    setDraft((p) => followRoster(p, change(p)));

  /** הצבעים שההגרלה תשתמש בהם — מההרכב הקיים, או מהגדרת המחזור */
  const teamIds = useMemo(
    () => (lineup ? lineupTeams(lineup) : defaultTeamIds(teamCount)),
    [lineup, teamCount],
  );

  // הכימיה המשחקית נכנסת לחישוב רק אם הקריטריון דלוק בסדר העדיפויות
  const gameChemistryOn = priorities.find((p) => p.id === 'gameChemistry')?.enabled;
  const activeEffects = useMemo(
    () => (gameChemistryOn ? pairEffects : new Map<string, number>()),
    [gameChemistryOn, pairEffects],
  );

  const stats = useMemo(
    () => computeStats(lineup ?? emptyLineup(teamIds), pool, activeEffects),
    [lineup, teamIds, pool, activeEffects],
  );

  const ratingOf = useMemo(() => new Map(pool.map((p) => [p.id, p.rating])), [pool]);
  const breakdown = useMemo(
    () =>
      penaltyBreakdown(
        { lineup: lineup ?? emptyLineup(teamIds), pool, ratingOf, pairEffects: activeEffects },
        priorities,
      ),
    [lineup, teamIds, pool, ratingOf, activeEffects, priorities],
  );
  const tiersScore = useMemo(
    () =>
      Math.round(
        (1 -
          tiersPenalty({
            lineup: lineup ?? emptyLineup(teamIds),
            pool,
            ratingOf,
            pairEffects: activeEffects,
          })) *
          100,
      ),
    [lineup, teamIds, pool, ratingOf, activeEffects],
  );
  const positionsScore = useMemo(
    () =>
      Math.round(
        (1 -
          positionsPenalty({
            lineup: lineup ?? emptyLineup(teamIds),
            pool,
            ratingOf,
            pairEffects: activeEffects,
          })) *
          100,
      ),
    [lineup, teamIds, pool, ratingOf, activeEffects],
  );

  // השוואה בין ההגרלה המקורית למצב אחרי העריכות הידניות
  const diff = useMemo(
    () =>
      lineup && baseline
        ? compareLineups(baseline, lineup, pool, activeEffects, priorities, constraints)
        : null,
    [lineup, baseline, pool, activeEffects, priorities, constraints],
  );

  const unavailable = useMemo(() => {
    const map: Partial<Record<CriterionId, string>> = {};
    if (!pairEffects.size) map.gameChemistry = 'עוד אין מספיק היסטוריה עם תוצאות כדי ללמוד זוגות';
    if (!players.some((p) => p.loveIds.length || p.hateIds.length))
      map.affinity = 'עוד לא הוגדרו העדפות "עם / בלי" לשחקנים';
    if (!players.some((p) => p.friendIds.length)) map.friends = 'עוד לא הוגדרו חברויות';
    return map;
  }, [pairEffects, players]);
  const bonds = useMemo(
    () => describeBonds(lineup ?? emptyLineup(teamIds), pool),
    [lineup, teamIds, pool],
  );

  // המשלימים נכללים כאן כדי שהשם שלהם יופיע בשיתוף ובכרטיסים
  const nameById = useMemo(
    () => new Map(pool.map((p) => [p.id, p.name])),
    [pool],
  );

  const shareTeams: ShareTeams = useMemo(() => {
    const l = lineup ?? emptyLineup(teamIds);
    return Object.fromEntries(
      lineupTeams(l).map((t) => [t, membersOf(l, t).map((id) => nameById.get(id) ?? '')]),
    );
  }, [lineup, teamIds, nameById]);

  const shareFormations: ShareFormations = useMemo(() => {
    const photoOf = new Map(pool.map((p) => [p.id, p.photo]));
    // קבוצה ריקה לא נשלחת כמערך — כמו שהרשימה מדלגת עליה, ולא מגרש ריק עם "מתחלפים בשער"
    return Object.fromEntries(
      teamsIn(stats.teams).filter((t) => stats.teams[t]!.count > 0).map((t) => {
        const fit = stats.teams[t]!.formation;
        const namesAt = (line: FieldPosition) =>
          fit.spots
            .filter((s) => s.position === line)
            .map((s) => ({ name: nameById.get(s.id) ?? '', photo: photoOf.get(s.id) }))
            .sort((a, b) => a.name.localeCompare(b.name, 'he'));
        return [
          t,
          {
            label: formationLabel(fit.formation),
            lines: { gk: namesAt('gk'), def: namesAt('def'), mid: namesAt('mid'), att: namesAt('att') },
          },
        ];
      }),
    );
  }, [stats, nameById, pool]);

  const setLineup =(l: Lineup | null) => setDraft((p) => ({ ...p, lineup: l }));

  /**
   * כל שינוי ידני עובר כאן: מחשבים מה הפעולה הזו בדיוק עשתה,
   * מציגים הודעה קופצת, ושומרים את המצב הקודם כדי לאפשר ביטול.
   */
  const applyChange = (next: Lineup) => {
    if (!lineup) return;
    const immediate = compareLineups(lineup, next, pool, activeEffects, priorities, constraints);
    setLineup(next);
    setSelectedPlayer(null);
    if (immediate.changed) {
      setLastChange({ diff: immediate, previous: lineup, id: changeIdRef.current++ });
    }
  };

  /**
   * הצירופים שכבר היו — ההרכב שעל המסך ראשון, ואחריו ההיסטוריה.
   * בזכות זה "הגרלה מחדש" מתרחקת ממה שרואים, ולא רק משבוע לשבוע.
   */
  const recentPairs = useMemo(
    () => recentPairWeights([...(lineup ? [lineup] : []), ...recentLineups]),
    [lineup, recentLineups],
  );

  const generate = () => {
    if (pool.length < teamCount) {
      notify(`צריך לפחות ${teamCount} שחקנים כדי לחלק ל-${teamCount} קבוצות`);
      return;
    }
    // הגרלה חדשה תמיד יוצאת מהצבעים של הגדרת המחזור, לא מהצבעים הקודמים
    const colors = defaultTeamIds(teamCount);
    // קריטריונים בלי נתונים מכובים כדי שלא יבזבזו משקל
    const effective = priorities.map((p) =>
      unavailable[p.id] ? { ...p, enabled: false } : p,
    );
    const next = generateLineup(pool, {
      priorities: effective,
      pairEffects: activeEffects,
      teamIds: colors,
      recentPairs,
      constraints,
    });
    // ההגרלה הטרייה היא גם נקודת ההשוואה לעריכות שיבואו אחריה
    setDraft((p) => ({ ...p, lineup: next, baseline: next }));
    setSelectedPlayer(null);
    setLastChange(null);
    notify('הקבוצות הוגרלו! ⚽');
  };

  /**
   * שינוי צבע של קבוצה. אותה החלפה מוחלת גם על ההגרלה המקורית, אחרת דוח
   * השינויים היה מדווח שכל השחקנים "עברו קבוצה" — בעוד שבפועל רק הצבע התחלף.
   */
  const handleRecolor = (from: TeamId, to: TeamId) => {
    if (!lineup) return;
    setDraft((p) => ({
      ...p,
      lineup: recolorTeam(lineup, from, to),
      baseline: p.baseline ? recolorTeam(p.baseline, from, to) : p.baseline,
    }));
    notify(
      to in lineup
        ? `${TEAM_META[from].name} ו${TEAM_META[to].name} החליפו צבעים`
        : `הקבוצה משחקת עכשיו ב${TEAM_META[to].name}`,
    );
  };

  const handleSelect = (id: string) => {
    if (!lineup) return;
    if (!selectedPlayer) {
      setSelectedPlayer(id);
      return;
    }
    if (selectedPlayer === id) {
      setSelectedPlayer(null);
      return;
    }
    if (findTeamOf(lineup, selectedPlayer) === findTeamOf(lineup, id)) {
      setSelectedPlayer(id); // אותה קבוצה — פשוט מעבירים את הבחירה
      return;
    }
    applyChange(swapPlayers(lineup, selectedPlayer, id));
  };

  const selectedName = selectedPlayer ? nameById.get(selectedPlayer) : null;

  if (players.length === 0) {
    return (
      <EmptyState
        icon={<Users size={28} />}
        title="אין עדיין שחקנים במאגר"
        hint='עברו ללשונית "שחקנים" והוסיפו את הסגל הקבוע, או נסו את מצב הדוגמה מלמעלה.'
      />
    );
  }

  return (
    <div className="space-y-4">
      <RoundPanel
        players={players}
        matchDate={matchDate}
        selectedIds={selectedIds}
        cancelledIds={cancelledIds}
        substitutions={substitutions}
        streaks={streaks}
        hasLineup={!!lineup}
        teamCount={teamCount}
        fillerCount={fillers.length}
        onAddPlayers={onAddPlayers}
        onListPasted={(ids) => onListPasted(matchDate, ids)}
        onSetAll={(ids) =>
          setDraft((p) => ({ ...p, selectedIds: ids, cancelledIds: [], substitutions: [] }))
        }
        onClearRound={() => {
          // מחזור חדש — החלוקה של הקודם לא שייכת אליו
          setDraft((p) => ({
            ...p,
            selectedIds: [],
            cancelledIds: [],
            substitutions: [],
            lineup: null,
            baseline: null,
            fillers: [],
            constraints: [],
          }));
          setSelectedPlayer(null);
          setLastChange(null);
        }}
        onToggle={(id) =>
          setRoster((p) => {
            const leaving = p.selectedIds.includes(id);
            return {
              ...p,
              selectedIds: leaving ? p.selectedIds.filter((x) => x !== id) : [...p.selectedIds, id],
              // A replacement who isn't coming any more isn't replacing anyone either
              substitutions: leaving ? p.substitutions.filter((s) => s.inId !== id) : p.substitutions,
            };
          })
        }
        onCancel={(id) =>
          setRoster((p) => ({
            ...p,
            cancelledIds: p.cancelledIds.includes(id) ? p.cancelledIds : [...p.cancelledIds, id],
            // מי שביטל יורד אוטומטית מרשימת המשחקים
            selectedIds: p.selectedIds.filter((x) => x !== id),
            // and if he was replacing someone, that replacement is off too
            substitutions: p.substitutions.filter((s) => s.inId !== id),
          }))
        }
        onUncancel={(id) =>
          setRoster((p) => {
            // הוא חוזר לשחק, ולכן המחליף שנכנס במקומו כבר לא נחוץ
            const substitutions = p.substitutions.filter((s) => s.outId !== id);
            const selected = dropStaleReplacement(
              p.selectedIds,
              p.substitutions.find((s) => s.outId === id)?.inId,
              substitutions,
            );
            return {
              ...p,
              cancelledIds: p.cancelledIds.filter((x) => x !== id),
              selectedIds: selected.includes(id) ? selected : [...selected, id],
              substitutions,
            };
          })
        }
        onSubstitute={(outId, inId) =>
          setRoster((p) => {
            const substitutions = [
              ...p.substitutions.filter((s) => s.outId !== outId),
              { outId, inId },
            ];
            // החלפת מחליף — הקודם יוצא, אחרת שניהם היו נשארים במחזור
            const selected = dropStaleReplacement(
              p.selectedIds,
              p.substitutions.find((s) => s.outId === outId)?.inId,
              substitutions,
            );
            return {
              ...p,
              selectedIds: selected.includes(inId) ? selected : [...selected, inId],
              substitutions,
            };
          })
        }
      />

      <FormatPanel
        teamCount={teamCount}
        fillers={fillers}
        playerCount={selectedIds.length}
        onChangeTeamCount={(next) =>
          setDraft((p) => ({
            ...p,
            teamCount: next,
            // ההרכב הקיים בנוי על מספר קבוצות אחר — מגרילים מחדש
            lineup: null,
            baseline: null,
          }))
        }
        onSetFillers={(next) =>
          setDraft((p) => ({
            ...p,
            fillers: next,
            // ההרכב הקיים כבר לא מתאר את מי שמשחק — מגרילים מחדש
            lineup: null,
            baseline: null,
          }))
        }
        notify={notify}
      />

      <PrioritiesPanel
        priorities={priorities}
        onChange={setPriorities}
        unavailable={unavailable}
      />

      <ConstraintsPanel
        pool={pool}
        players={players}
        constraints={constraints}
        lineup={lineup}
        onChange={(next) => setDraft((p) => ({ ...p, constraints: next }))}
        notify={notify}
      />

      {/* סרגל הגרלה */}
      <div className="card flex flex-col gap-3 p-4 xl:flex-row xl:items-center">
        <button
          className="btn-primary xl:w-44"
          onClick={generate}
          disabled={pool.length < teamCount}
        >
          <Shuffle size={17} />
          {lineup ? 'הגרלה מחדש' : 'הגרלת קבוצות'}
        </button>

        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-400" htmlFor="match-date">
            תאריך
          </label>
          <input
            id="match-date"
            type="date"
            className="input w-auto py-2"
            value={matchDate}
            onChange={(e) => setDraft((p) => ({ ...p, matchDate: e.target.value }))}
          />
        </div>

        <div className="flex-1" />

        {lineup && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl border border-slate-700/80 bg-slate-800/40 p-1">
              <TabBtn active={mode === 'admin'} onClick={() => setMode('admin')}>
                <Scale size={14} />
                עריכה
              </TabBtn>
              <TabBtn active={mode === 'share'} onClick={() => setMode('share')}>
                <Sparkles size={14} />
                מצב וואטסאפ
              </TabBtn>
            </div>

            <button
              className="btn-ghost"
              onClick={() => {
                if (unplaced.length) {
                  notify(`⚠️ ${unplaced.map((p) => p.name).join(', ')} לא בשום קבוצה — שבצו או הגרילו מחדש`);
                  return;
                }
                const outcome = onSaveHistory(lineup, matchDate, cancelledIds);
                // The stored teams become exactly what was saved, without players who left the
                // round — so marking this evening's result recognises it and clears the round
                setDraft((p) => ({ ...p, lineup, baseline }));
                notify(
                  outcome === 'resultCleared'
                    ? 'הקבוצות של הערב עודכנו — התוצאה שסומנה נמחקה, צריך לסמן אותה שוב'
                    : isDemo
                      ? 'נוסף להיסטוריית הדוגמה (זמני)'
                      : outcome === 'replaced'
                        ? 'הקבוצות של הערב עודכנו ✔'
                        : 'הקבוצות נשמרו בהיסטוריה ✔',
                );
              }}
            >
              <Save size={16} />
              שמירת הקבוצות
            </button>

            <button
              className="btn-ghost !px-2.5 text-slate-400 hover:text-rose-300"
              title="מחיקת החלוקה לקבוצות. רשימת מי שמשחק נשארת — כדי לנקות אותה יש 'ניקוי המחזור' למעלה"
              onClick={() => {
                setDraft((p) => ({ ...p, lineup: null, baseline: null }));
                setSelectedPlayer(null);
                setLastChange(null);
                notify('החלוקה נמחקה — רשימת המשתתפים נשארה');
              }}
            >
              <Trash2 size={16} />
            </button>
          </div>
        )}
      </div>

      {/* תוצאות */}
      {!lineup ? (
        <EmptyState
          icon={<Shuffle size={28} />}
          title="עוד לא בוצעה הגרלה"
          hint={`נבחרו ${pool.length} שחקנים. לחצו על "הגרלת קבוצות" כדי לחלק אותם ל-${teamCount} קבוצות מאוזנות של ${teamSizeList(pool.length, teamCount).join(' / ')}.`}
        />
      ) : mode === 'share' ? (
        <ShareView
          teams={shareTeams}
          formations={shareFormations}
          date={matchDate}
          onCopied={notify}
        />
      ) : (
        <>
          {unplaced.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-200">
              <span>
                <b>{unplaced.map((p) => p.name).join(', ')}</b> משחק{unplaced.length > 1 ? 'ים' : ''} השבוע
                אבל לא בשום קבוצה.
              </span>
              <button
                className="btn-ghost ms-auto !py-1.5 text-xs"
                onClick={() => setDraft((p) => followRoster(p, p))}
              >
                שיבוץ בקבוצות הקטנות
              </button>
            </div>
          )}

          {diff?.changed && (
            <ChangeReport
              diff={diff}
              onRevert={() => {
                setLineup(baseline);
                setSelectedPlayer(null);
                setLastChange(null);
                notify('חזרנו להגרלה המקורית');
              }}
            />
          )}

          <CriteriaScores
            breakdown={breakdown}
            unavailable={unavailable}
            tiers={tiersScore}
            positions={
              players.some((p) => !p.positions.includes('any')) ? positionsScore : null
            }
            stats={stats}
          />
          {bonds.length > 0 && <BondsPanel bonds={bonds} />}

          {selectedName && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-200">
              <ArrowLeftRight size={15} />
              <b>{selectedName}</b> נבחר — לחצו על שחקן אחר להחלפה, או על כותרת קבוצה כדי להעביר אליה.
              <button
                className="ms-auto text-xs font-semibold text-emerald-300/80 underline"
                onClick={() => setSelectedPlayer(null)}
              >
                ביטול
              </button>
            </div>
          )}

          <div className="flex justify-center">
            <div className="inline-flex rounded-xl border border-slate-700 bg-slate-900/60 p-1 text-xs font-semibold">
              {(
                [
                  ['pitch', '⚽ מערך'],
                  ['list', '📋 רשימה'],
                ] as const
              ).map(([view, label]) => (
                <button
                  key={view}
                  onClick={() => setTeamView(view)}
                  aria-pressed={teamView === view}
                  className={`rounded-lg px-4 py-1.5 transition ${
                    teamView === view
                      ? 'bg-emerald-500/20 text-emerald-200'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className={teamGridClass(teamIds.length)}>
            {teamIds.map((id) => (
              <TeamCard
                key={id}
                view={teamView}
                teamId={id}
                playerIds={membersOf(lineup, id)}
                pool={pool}
                lineup={lineup}
                stats={stats.teams[id]!}
                selectedId={selectedPlayer}
                onSelect={handleSelect}
                onMove={(playerId, to) => applyChange(movePlayer(lineup, playerId, to))}
                onSwap={(a, b) => applyChange(swapPlayers(lineup, a, b))}
                onRecolor={(to) => handleRecolor(id, to)}
              />
            ))}
          </div>
        </>
      )}

      {lastChange && (
        <ChangePopup
          diff={lastChange.diff}
          onClose={() => setLastChange(null)}
          onUndo={() => {
            setLineup(lastChange.previous);
            setSelectedPlayer(null);
            setLastChange(null);
            notify('השינוי בוטל');
          }}
        />
      )}
    </div>
  );
}

/* --------------------- ציון לכל קריטריון בהגרלה --------------------- */

const SCORE_TONES = [
  { min: 90, label: '90–100 מצוין', chip: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300', dot: 'bg-emerald-400' },
  { min: 70, label: '70–89 סביר', chip: 'border-sky-500/30 bg-sky-500/10 text-sky-300', dot: 'bg-sky-400' },
  { min: 0, label: 'מתחת ל-70 חלש', chip: 'border-amber-500/30 bg-amber-500/10 text-amber-300', dot: 'bg-amber-400' },
] as const;

const scoreTone = (score: number) => SCORE_TONES.find((t) => score >= t.min)!.chip;

/**
 * שורת הסיכום מעל הקבוצות: האיזון וציון לכל קריטריון.
 * הסכומים לכל קבוצה כבר בכרטיסי הקבוצות עצמם, ולכן לא חוזרים כאן.
 */
function CriteriaScores({
  breakdown,
  unavailable,
  tiers,
  positions,
  stats,
}: {
  breakdown: ReturnType<typeof penaltyBreakdown>;
  unavailable: Partial<Record<CriterionId, string>>;
  /** ציוני פיזור הרמות והמערך — תמיד פעילים, ולכן בלי מספר עדיפות */
  tiers: number;
  /** null = לאף שחקן לא הוגדרה עמדה, ואז אין מה להציג */
  positions: number | null;
  stats: ReturnType<typeof computeStats>;
}) {
  const active = breakdown.filter((b) => b.enabled && !unavailable[b.id]);

  // כשהקבוצות לא באותו גודל, השוואת סכומים תמיד תיראה גרועה — הקבוצה הקטנה
  // תמיד תצבור פחות. במקרה כזה מודדים לפי הממוצע, שזה גם מה שהאלגוריתם ממטב.
  const sizes = Object.values(stats.teams)
    .map((t) => t?.count ?? 0)
    .filter((c) => c > 0);
  const equalSizes = new Set(sizes).size <= 1;
  const level = balanceLevel(stats.spread);

  return (
    <div className="card space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${SCORE_TONES[level].chip}`}
          title={
            equalSizes
              ? 'ההפרש בסכום הדירוגים בין הקבוצה החזקה לחלשה'
              : `הקבוצות לא באותו גודל (${sizes.join('/')}), לכן ההשוואה היא לפי דירוג ממוצע לשחקן`
          }
        >
          ⚖️ איזון {BALANCE_GRADES[level]}
          <span className="opacity-80">
            · {equalSizes ? 'פער' : 'פער לשחקן'}{' '}
            <span dir="ltr" className="font-mono tabular-nums">
              {equalSizes ? stats.totalSpread.toFixed(1) : stats.spread.toFixed(2)}
            </span>
          </span>
        </span>

        <span
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${scoreTone(tiers)}`}
          title={TIERS_META.help}
        >
          {TIERS_META.emoji} {TIERS_META.label}
          <span dir="ltr" className="font-mono tabular-nums">
            {tiers}
          </span>
        </span>
        {positions !== null && (
          <span
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${scoreTone(positions)}`}
            title={POSITIONS_META.help}
          >
            {POSITIONS_META.emoji} {POSITIONS_META.label}
            <span dir="ltr" className="font-mono tabular-nums">
              {positions}
            </span>
          </span>
        )}
        {active.map((b) => {
          const meta = CRITERION_META[b.id];

          return (
            <span
              key={b.id}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${scoreTone(b.score)}`}
              title={`${meta.help} — עדיפות ${b.rank + 1}`}
            >
              <span className="font-mono text-[10px] opacity-70">{b.rank + 1}</span>
              {meta.emoji} {meta.label}
              <span dir="ltr" className="font-mono tabular-nums">
                {b.score}
              </span>
            </span>
          );
        })}
      </div>

      {/* מקרא: מה אומר הציון של כל קריטריון */}
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500">
        <span>100 = הקריטריון מתקיים במלואו</span>
        {SCORE_TONES.map((t) => (
          <span key={t.min} className="inline-flex items-center gap-1">
            <span className={`size-1.5 rounded-full ${t.dot}`} />
            {t.label}
          </span>
        ))}
      </p>
    </div>
  );
}

/* ------------------------ פירוט קשרי החברות ------------------------ */

const BOND_KIND = {
  friend: { label: 'חברים', wantsTogether: true, icon: Link2 },
  love: { label: 'מעדיף עם', wantsTogether: true, icon: ThumbsUp },
  hate: { label: 'מעדיף בלי', wantsTogether: false, icon: ThumbsDown },
} as const;

function BondsPanel({ bonds }: { bonds: ReturnType<typeof describeBonds> }) {
  const isSatisfied = (b: (typeof bonds)[number]) =>
    BOND_KIND[b.kind].wantsTogether ? b.together : !b.together;
  const ok = bonds.filter(isSatisfied).length;
  const broken = bonds.length - ok;
  // ברירת מחדל סגור — הפירוט המלא ארוך, ובדרך כלל מספיק לדעת כמה נשברו
  const [open, setOpen] = useState(false);

  return (
    <div className="card overflow-hidden">
      <button
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-start transition hover:bg-slate-800/40"
        onClick={() => setOpen((v) => !v)}
      >
        <h3 className="text-xs font-bold tracking-wide text-slate-400">
          קשרים בין שחקנים — {ok} מתוך {bonds.length} כובדו
          {broken > 0 && <span className="text-amber-300"> · {broken} לא</span>}
        </h3>
        <ChevronDown
          size={16}
          className={`shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {!open ? null : (
      <ul className="flex flex-wrap gap-2 px-4 pb-4">
        {bonds.map((b) => {
          const kind = BOND_KIND[b.kind];
          const Icon = kind.icon;
          const good = isSatisfied(b);

          return (
            <li
              key={`${b.kind}-${b.aId}-${b.bId}`}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${
                good
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
              }`}
              title={`${kind.label}: ${b.aName} ו${b.bName}`}
            >
              <Icon size={11} />
              {b.aName} · {b.bName}
              <span className="opacity-70">
                {b.together && b.team ? `יחד ב${TEAM_META[b.team].name}` : 'מופרדים'}
              </span>
              {!good && <span className="text-amber-400">✕</span>}
            </li>
          );
        })}
      </ul>
      )}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
        active ? 'bg-emerald-500 text-emerald-950' : 'text-slate-300 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}
