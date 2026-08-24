import { useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  ChevronDown,
  Eye,
  EyeOff,
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
  teamStatsGridClass,
  type Lineup,
  type Player,
  type TeamId,
} from '../types';
import {
  CHEMISTRY_BONUS_PER_BOND,
  computeStats,
  describeBonds,
  findTeamOf,
  generateLineup,
  movePlayer,
  swapPlayers,
  teamSizeList,
} from '../lib/balance';
import {
  CRITERION_META,
  penaltyBreakdown,
  type CriterionId,
  type CriterionSetting,
} from '../lib/criteria';
import { compareLineups, type LineupDiff } from '../lib/diff';
import type { Draft } from '../lib/storage';
import { EmptyState } from './ui';
import { RoundPanel } from './RoundPanel';
import { FormatPanel } from './FormatPanel';
import { PrioritiesPanel } from './PrioritiesPanel';
import { ChangeReport } from './ChangeReport';
import { ChangePopup } from './ChangePopup';
import { TeamCard } from './TeamCard';
import { ShareView } from './ShareView';
import type { ShareTeams } from '../lib/format';

type Mode = 'admin' | 'share';

export function DrawView({
  players,
  draft,
  setDraft,
  streaks,
  pairEffects,
  priorities,
  setPriorities,
  onSaveHistory,
  notify,
  isDemo,
}: {
  players: Player[];
  draft: Draft;
  setDraft: (updater: (prev: Draft) => Draft) => void;
  streaks: Map<string, number>;
  /** אפקטים נלמדים לזוגות, מתוך ההיסטוריה */
  pairEffects: Map<string, number>;
  priorities: CriterionSetting[];
  setPriorities: (next: CriterionSetting[]) => void;
  onSaveHistory: (lineup: Lineup, date: string, cancelledIds: string[]) => void;
  notify: (msg: string) => void;
  isDemo: boolean;
}) {
  const [mode, setMode] = useState<Mode>('admin');
  const [adminView, setAdminView] = useState(true);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
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
    lineup,
    baseline,
    matchDate,
    teamCount,
    fillers,
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

  // השוואה בין ההגרלה המקורית למצב אחרי העריכות הידניות
  const diff = useMemo(
    () =>
      lineup && baseline
        ? compareLineups(baseline, lineup, pool, activeEffects, priorities)
        : null,
    [lineup, baseline, pool, activeEffects, priorities],
  );

  const unavailable = useMemo(() => {
    const map: Partial<Record<CriterionId, string>> = {};
    if (!pairEffects.size) map.gameChemistry = 'עוד אין מספיק היסטוריה עם תוצאות כדי ללמוד זוגות';
    if (!players.some((p) => p.tags.length)) map.tags = 'עוד לא הוגדרו תגיות לשחקנים';
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

  const setLineup = (l: Lineup | null) => setDraft((p) => ({ ...p, lineup: l }));

  /**
   * כל שינוי ידני עובר כאן: מחשבים מה הפעולה הזו בדיוק עשתה,
   * מציגים הודעה קופצת, ושומרים את המצב הקודם כדי לאפשר ביטול.
   */
  const applyChange = (next: Lineup) => {
    if (!lineup) return;
    const immediate = compareLineups(lineup, next, pool, activeEffects, priorities);
    setLineup(next);
    setSelectedPlayer(null);
    if (immediate.changed) {
      setLastChange({ diff: immediate, previous: lineup, id: changeIdRef.current++ });
    }
  };

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
        onSetAll={(ids) =>
          setDraft((p) => ({ ...p, selectedIds: ids, cancelledIds: [], substitutions: [] }))
        }
        onToggle={(id) =>
          setDraft((p) => ({
            ...p,
            selectedIds: p.selectedIds.includes(id)
              ? p.selectedIds.filter((x) => x !== id)
              : [...p.selectedIds, id],
          }))
        }
        onCancel={(id) =>
          setDraft((p) => ({
            ...p,
            cancelledIds: p.cancelledIds.includes(id) ? p.cancelledIds : [...p.cancelledIds, id],
            // מי שביטל יורד אוטומטית מרשימת המשחקים
            selectedIds: p.selectedIds.filter((x) => x !== id),
          }))
        }
        onUncancel={(id) =>
          setDraft((p) => ({
            ...p,
            cancelledIds: p.cancelledIds.filter((x) => x !== id),
            selectedIds: p.selectedIds.includes(id) ? p.selectedIds : [...p.selectedIds, id],
            substitutions: p.substitutions.filter((s) => s.outId !== id),
          }))
        }
        onSubstitute={(outId, inId) =>
          setDraft((p) => ({
            ...p,
            selectedIds: p.selectedIds.includes(inId) ? p.selectedIds : [...p.selectedIds, inId],
            substitutions: [...p.substitutions.filter((s) => s.outId !== outId), { outId, inId }],
          }))
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

            {mode === 'admin' && (
              <button
                className="btn-ghost"
                onClick={() => setAdminView((v) => !v)}
                title="מסתיר או מציג את הדירוגים והציונים על המסך"
              >
                {adminView ? <EyeOff size={16} /> : <Eye size={16} />}
                {adminView ? 'הסתרת דירוגים' : 'הצגת דירוגים'}
              </button>
            )}

            <button
              className="btn-ghost"
              onClick={() => {
                onSaveHistory(lineup, matchDate, cancelledIds);
                notify(isDemo ? 'נוסף להיסטוריית הדוגמה (זמני)' : 'הקבוצות נשמרו בהיסטוריה ✔');
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
        <ShareView teams={shareTeams} date={matchDate} onCopied={notify} />
      ) : (
        <>
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

          {adminView && (
            <>
              <BalanceBar stats={stats} teamIds={teamIds} gameChemistry={!!gameChemistryOn} />
              <CriteriaScores breakdown={breakdown} unavailable={unavailable} />
              {bonds.length > 0 && <BondsPanel bonds={bonds} />}
            </>
          )}

          {selectedName && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-200">
              <ArrowLeftRight size={15} />
              <b>{selectedName}</b> נבחר — לחצו על שחקן אחר להחלפה, או על כותרת קבוצה כדי להעביר אליה.
              <button
                className="mr-auto text-xs font-semibold text-emerald-300/80 underline"
                onClick={() => setSelectedPlayer(null)}
              >
                ביטול
              </button>
            </div>
          )}

          <div className={teamGridClass(teamIds.length)}>
            {teamIds.map((id) => (
              <TeamCard
                key={id}
                teamId={id}
                playerIds={membersOf(lineup, id)}
                pool={pool}
                lineup={lineup}
                stats={stats.teams[id]!}
                adminView={adminView}
                selectedId={selectedPlayer}
                onSelect={handleSelect}
                onMove={(playerId, to) => applyChange(movePlayer(lineup, playerId, to))}
                onSwap={(a, b) => applyChange(swapPlayers(lineup, a, b))}
                onRecolor={(to) => handleRecolor(id, to)}
              />
            ))}
          </div>

          <p className="text-center text-[11px] leading-relaxed text-slate-500">
            לחיצה על שני שחקנים מחליפה ביניהם, ולחיצה על שחקן ואז על כותרת קבוצה מעבירה אליה.
            <span className="hidden sm:inline"> במחשב אפשר גם לגרור.</span>
          </p>
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

function CriteriaScores({
  breakdown,
  unavailable,
}: {
  breakdown: ReturnType<typeof penaltyBreakdown>;
  unavailable: Partial<Record<CriterionId, string>>;
}) {
  const active = breakdown.filter((b) => b.enabled && !unavailable[b.id]);
  if (!active.length) return null;

  return (
    <div className="card flex flex-wrap items-center gap-2 px-4 py-3">
      <span className="text-[11px] font-bold text-slate-400">עמידה בקריטריונים:</span>
      {active.map((b) => {
        const meta = CRITERION_META[b.id];
        const tone =
          b.score >= 90
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
            : b.score >= 70
              ? 'border-sky-500/30 bg-sky-500/10 text-sky-300'
              : 'border-amber-500/30 bg-amber-500/10 text-amber-300';

        return (
          <span
            key={b.id}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${tone}`}
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
  );
}

/* --------------------------- פס איזון עליון --------------------------- */

function BalanceBar({
  stats,
  teamIds,
  gameChemistry,
}: {
  stats: ReturnType<typeof computeStats>;
  teamIds: TeamId[];
  gameChemistry: boolean;
}) {
  // כשהקבוצות לא באותו גודל, השוואת סכומים תמיד תיראה גרועה — הקבוצה הקטנה
  // תמיד תצבור פחות. במקרה כזה מודדים לפי הממוצע, שזה גם מה שהאלגוריתם ממטב.
  const sizes = teamIds.map((id) => stats.teams[id]?.count ?? 0).filter((c) => c > 0);
  const equalSizes = new Set(sizes).size <= 1;

  const quality =
    stats.spread <= 0.1
      ? { label: 'איזון מצוין', tone: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30' }
      : stats.spread <= 0.25
        ? { label: 'איזון טוב', tone: 'text-sky-300 bg-sky-500/15 border-sky-500/30' }
        : { label: 'איזון בינוני', tone: 'text-amber-300 bg-amber-500/15 border-amber-500/30' };

  return (
    <div className="card space-y-3 p-4">
      <div className={teamStatsGridClass(teamIds.length)}>
        {teamIds.map((id) => {
          const t = stats.teams[id];
          if (!t) return null;
          return (
            <div
              key={id}
              className={`rounded-xl border px-2 py-2 text-center sm:px-3 sm:py-2.5 sm:text-right ${TEAM_META[id].chip}`}
              title={
                `${t.count} שחקנים · דירוג ${t.total.toFixed(1)} + חברויות ${t.chemistryBonus.toFixed(1)}` +
                (gameChemistry ? ` + כימיה משחקית ${t.gameBonus.toFixed(1)}` : '')
              }
            >
              <p className="flex items-center justify-center gap-1.5 text-[11px] font-bold sm:justify-start sm:text-xs">
                <span className={`size-2 shrink-0 rounded-full sm:size-2.5 ${TEAM_META[id].dot}`} />
                {TEAM_META[id].name}
                <span className="hidden font-mono text-[10px] opacity-70 sm:mr-auto sm:inline">
                  {t.count} שחקנים
                </span>
              </p>
              <div className="mt-1 flex flex-col items-center gap-0 sm:mt-2 sm:flex-row sm:items-baseline sm:gap-3">
                <span className="flex items-baseline gap-1">
                  <span dir="ltr" className="font-mono text-lg font-bold tabular-nums sm:text-xl">
                    {t.total.toFixed(1)}
                  </span>
                  <span className="text-[10px] opacity-70">דירוג</span>
                </span>
                <span className="flex items-baseline gap-1 opacity-90">
                  <span dir="ltr" className="font-mono text-xs font-bold tabular-nums sm:text-sm">
                    {t.combined.toFixed(1)}
                  </span>
                  <span className="text-[10px] opacity-70">כימיה</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span
          className={`rounded-lg border px-2.5 py-1.5 font-semibold ${quality.tone}`}
          title={
            equalSizes
              ? 'ההפרש בסכום הדירוגים בין הקבוצה החזקה לחלשה'
              : 'הקבוצות לא באותו גודל, לכן ההשוואה היא לפי דירוג ממוצע לשחקן'
          }
        >
          {quality.label} ·{' '}
          {equalSizes ? (
            <>
              פער בדירוג{' '}
              <span dir="ltr" className="font-mono tabular-nums">
                {stats.totalSpread.toFixed(1)}
              </span>
            </>
          ) : (
            <>
              פער לשחקן{' '}
              <span dir="ltr" className="font-mono tabular-nums">
                {stats.spread.toFixed(2)}
              </span>
            </>
          )}
        </span>
        {equalSizes && (
          <span className="rounded-lg border border-slate-700 bg-slate-800/50 px-2.5 py-1.5 font-semibold text-slate-300">
            פער עם כימיה{' '}
            <span dir="ltr" className="font-mono tabular-nums">
              {stats.combinedSpread.toFixed(1)}
            </span>
          </span>
        )}
        {!equalSizes && (
          <span className="rounded-lg border border-slate-700 bg-slate-800/50 px-2.5 py-1.5 font-semibold text-slate-400">
            קבוצות בגדלים שונים ({sizes.join('/')}) — הסכומים אינם ברי-השוואה
          </span>
        )}
        {stats.totalBonds > 0 && (
          <span className="rounded-lg border border-slate-700 bg-slate-800/50 px-2.5 py-1.5 font-semibold text-slate-300">
            חברויות: {stats.bondsKept}/{stats.totalBonds} נשמרו
          </span>
        )}
        <span className="text-[11px] text-slate-500">
          כל זוג חברים באותה קבוצה שווה {CHEMISTRY_BONUS_PER_BOND} נקודות דירוג
        </span>
      </div>
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
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-right transition hover:bg-slate-800/40"
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
