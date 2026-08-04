import { useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Eye,
  EyeOff,
  Link2,
  Save,
  Scale,
  Shuffle,
  Sparkles,
  Trash2,
  Unlink,
  Users,
} from 'lucide-react';
import { TEAM_IDS, TEAM_META, emptyLineup, type Lineup, type Player } from '../types';
import {
  CHEMISTRY_LABEL,
  chemistryPriceInRating,
  computeStats,
  describeBonds,
  fmtAvg,
  findTeamOf,
  generateLineup,
  movePlayer,
  swapPlayers,
  type ChemistryLevel,
} from '../lib/balance';
import type { Draft } from '../lib/storage';
import { EmptyState } from './ui';
import { PlayerPicker } from './PlayerPicker';
import { TeamCard } from './TeamCard';
import { ShareView } from './ShareView';
import type { ShareTeams } from '../lib/format';

type Mode = 'admin' | 'share';

const CHEMISTRY_LEVELS: ChemistryLevel[] = ['off', 'light', 'strong'];

export function DrawView({
  players,
  draft,
  setDraft,
  onSaveHistory,
  notify,
  isDemo,
}: {
  players: Player[];
  draft: Draft;
  setDraft: (updater: (prev: Draft) => Draft) => void;
  onSaveHistory: (lineup: Lineup, date: string, cancelledIds: string[]) => void;
  notify: (msg: string) => void;
  isDemo: boolean;
}) {
  const [mode, setMode] = useState<Mode>('admin');
  const [adminView, setAdminView] = useState(true);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);

  const { selectedIds, cancelledIds, lineup, matchDate, chemistry } = draft;

  const pool = useMemo(() => {
    const set = new Set(selectedIds);
    return players.filter((p) => set.has(p.id));
  }, [players, selectedIds]);

  const stats = useMemo(() => computeStats(lineup ?? emptyLineup(), pool), [lineup, pool]);
  const bonds = useMemo(() => describeBonds(lineup ?? emptyLineup(), pool), [lineup, pool]);
  const nameById = useMemo(() => new Map(players.map((p) => [p.id, p.name])), [players]);

  const shareTeams: ShareTeams = useMemo(() => {
    const l = lineup ?? emptyLineup();
    return {
      white: l.white.map((id) => nameById.get(id) ?? ''),
      black: l.black.map((id) => nameById.get(id) ?? ''),
      colored: l.colored.map((id) => nameById.get(id) ?? ''),
    };
  }, [lineup, nameById]);

  const setLineup = (l: Lineup | null) => setDraft((p) => ({ ...p, lineup: l }));

  const generate = () => {
    if (pool.length < 3) {
      notify('צריך לבחור לפחות 3 שחקנים');
      return;
    }
    setLineup(generateLineup(pool, { chemistry }));
    setSelectedPlayer(null);
    notify('הכוחות הוגרלו! ⚽');
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
    setLineup(swapPlayers(lineup, selectedPlayer, id));
    setSelectedPlayer(null);
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
      <PlayerPicker
        players={players}
        selectedIds={selectedIds}
        cancelledIds={cancelledIds}
        onToggle={(id) =>
          setDraft((p) => ({
            ...p,
            selectedIds: p.selectedIds.includes(id)
              ? p.selectedIds.filter((x) => x !== id)
              : [...p.selectedIds, id],
          }))
        }
        onSetAll={(ids) => setDraft((p) => ({ ...p, selectedIds: ids }))}
        onToggleCancelled={(id) =>
          setDraft((p) => {
            const isCancelled = p.cancelledIds.includes(id);
            return {
              ...p,
              cancelledIds: isCancelled
                ? p.cancelledIds.filter((x) => x !== id)
                : [...p.cancelledIds, id],
              // מי שביטל יורד אוטומטית מרשימת המשחקים
              selectedIds: isCancelled ? p.selectedIds : p.selectedIds.filter((x) => x !== id),
            };
          })
        }
      />

      {/* סרגל הגרלה */}
      <div className="card flex flex-col gap-3 p-4 xl:flex-row xl:items-center">
        <button className="btn-primary xl:w-44" onClick={generate} disabled={pool.length < 3}>
          <Shuffle size={17} />
          {lineup ? 'הגרלה מחדש' : 'הגרלת כוחות'}
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

        <ChemistryPicker
          value={chemistry}
          onChange={(next) => setDraft((p) => ({ ...p, chemistry: next }))}
        />

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
                title="הצגה/הסתרה של דירוגים"
              >
                {adminView ? <Eye size={16} /> : <EyeOff size={16} />}
                {adminView ? 'תצוגת מנהל' : 'ללא דירוגים'}
              </button>
            )}

            <button
              className="btn-ghost"
              onClick={() => {
                onSaveHistory(lineup, matchDate, cancelledIds);
                if (!isDemo) notify('הכוחות נשמרו בהיסטוריה ✔');
              }}
            >
              <Save size={16} />
              שמירת הכוחות
            </button>

            <button
              className="btn-ghost !px-2.5 text-slate-400 hover:text-rose-300"
              title="ניקוי ההגרלה הנוכחית"
              onClick={() => {
                setLineup(null);
                setSelectedPlayer(null);
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
          hint={`נבחרו ${pool.length} שחקנים. לחצו על "הגרלת כוחות" כדי לחלק אותם לשלוש קבוצות מאוזנות.`}
        />
      ) : mode === 'share' ? (
        <ShareView teams={shareTeams} date={matchDate} onCopied={notify} />
      ) : (
        <>
          {adminView && (
            <>
              <BalanceBar stats={stats} chemistry={chemistry} />
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

          <div className="grid gap-4 lg:grid-cols-3">
            {TEAM_IDS.map((id) => (
              <TeamCard
                key={id}
                teamId={id}
                playerIds={lineup[id]}
                pool={pool}
                lineup={lineup}
                stats={stats.teams[id]}
                adminView={adminView}
                selectedId={selectedPlayer}
                onSelect={handleSelect}
                onMove={(playerId, to) => {
                  setLineup(movePlayer(lineup, playerId, to));
                  setSelectedPlayer(null);
                }}
                onSwap={(a, b) => {
                  setLineup(swapPlayers(lineup, a, b));
                  setSelectedPlayer(null);
                }}
              />
            ))}
          </div>

          <p className="text-center text-[11px] text-slate-500">
            אפשר לגרור שחקנים בין הקבוצות, או ללחוץ על שניים כדי להחליף ביניהם — הממוצעים מתעדכנים מיד.
          </p>
        </>
      )}
    </div>
  );
}

/* ------------------------- בורר עוצמת הכימיה ------------------------- */

function ChemistryPicker({
  value,
  onChange,
}: {
  value: ChemistryLevel;
  onChange: (next: ChemistryLevel) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold text-slate-400">כימיה</span>
      <div className="flex rounded-xl border border-slate-700/80 bg-slate-800/40 p-1">
        {CHEMISTRY_LEVELS.map((level) => (
          <button
            key={level}
            onClick={() => onChange(level)}
            title={
              level === 'off'
                ? 'מתעלם לגמרי מקשרי חברות — חלוקה לפי דירוג בלבד'
                : `מוותר על עד ${chemistryPriceInRating(level).toFixed(3)} נקודות פער בממוצע כדי לשמור זוג חברים יחד`
            }
            className={`cursor-pointer rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition ${
              value === level ? 'bg-emerald-500 text-emerald-950' : 'text-slate-300 hover:text-white'
            }`}
          >
            {CHEMISTRY_LABEL[level]}
          </button>
        ))}
      </div>
    </div>
  );
}

/* --------------------------- פס איזון עליון --------------------------- */

function BalanceBar({
  stats,
  chemistry,
}: {
  stats: ReturnType<typeof computeStats>;
  chemistry: ChemistryLevel;
}) {
  const quality =
    stats.spread <= 0.1
      ? { label: 'איזון מצוין', tone: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30' }
      : stats.spread <= 0.25
        ? { label: 'איזון טוב', tone: 'text-sky-300 bg-sky-500/15 border-sky-500/30' }
        : { label: 'איזון בינוני', tone: 'text-amber-300 bg-amber-500/15 border-amber-500/30' };

  return (
    <div className="card flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        {TEAM_IDS.map((id) => (
          <span
            key={id}
            className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${TEAM_META[id].chip}`}
          >
            <span className={`size-2.5 rounded-full ${TEAM_META[id].dot}`} />
            {TEAM_META[id].name}
            <span dir="ltr" className="font-mono tabular-nums">
              {fmtAvg(stats.teams[id].avg)}
            </span>
          </span>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`rounded-lg border px-2.5 py-1.5 font-semibold ${quality.tone}`}>
          {quality.label} · פער{' '}
          <span dir="ltr" className="font-mono tabular-nums">
            {stats.spread.toFixed(2)}
          </span>
        </span>
        {stats.totalBonds > 0 && (
          <span className="rounded-lg border border-slate-700 bg-slate-800/50 px-2.5 py-1.5 font-semibold text-slate-300">
            {CHEMISTRY_LABEL[chemistry]}: {stats.bondsKept}/{stats.totalBonds} קשרים
          </span>
        )}
      </div>
    </div>
  );
}

/* ------------------------ פירוט קשרי החברות ------------------------ */

function BondsPanel({ bonds }: { bonds: ReturnType<typeof describeBonds> }) {
  const kept = bonds.filter((b) => b.together);

  return (
    <div className="card p-4">
      <h3 className="mb-3 text-xs font-bold tracking-wide text-slate-400">
        קשרי חברות — {kept.length} מתוך {bonds.length} נשמרו
      </h3>
      <ul className="flex flex-wrap gap-2">
        {bonds.map((b) => (
          <li
            key={`${b.aId}-${b.bId}`}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${
              b.together
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
            }`}
          >
            {b.together ? <Link2 size={11} /> : <Unlink size={11} />}
            {b.aName} · {b.bName}
            <span className="opacity-70">
              {b.together && b.team ? `יחד ב${TEAM_META[b.team].name}` : 'מופרדים'}
            </span>
          </li>
        ))}
      </ul>
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
