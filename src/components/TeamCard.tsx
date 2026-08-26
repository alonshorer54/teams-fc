import { useState } from 'react';
import { GripVertical, Link2, Palette, Unlink, Users } from 'lucide-react';
import { ALL_TEAM_IDS, TEAM_META, type Lineup, type Player, type TeamId } from '../types';
import { CHEMISTRY_BONUS_PER_BOND, bondStatus, type TeamStats } from '../lib/balance';
import { RatingBadge } from './ui';

export function TeamCard({
  teamId,
  playerIds,
  pool,
  lineup,
  stats,
  adminView,
  selectedId,
  onSelect,
  onMove,
  onSwap,
  onRecolor,
}: {
  teamId: TeamId;
  playerIds: string[];
  pool: Player[];
  lineup: Lineup;
  stats: TeamStats;
  adminView: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMove: (playerId: string, to: TeamId) => void;
  onSwap: (aId: string, bId: string) => void;
  /** החלפת הצבע של הקבוצה. אם היעד תפוס — שתי הקבוצות מתחלפות. */
  onRecolor?: (to: TeamId) => void;
}) {
  const meta = TEAM_META[teamId];
  const byId = new Map(pool.map((p) => [p.id, p]));
  const [dropTarget, setDropTarget] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const handleDrop = (e: React.DragEvent, overPlayerId?: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(false);
    const draggedId = e.dataTransfer.getData('text/player-id');
    if (!draggedId) return;
    if (overPlayerId && overPlayerId !== draggedId) onSwap(draggedId, overPlayerId);
    else onMove(draggedId, teamId);
  };

  return (
    <section
      className={`card flex h-full flex-col overflow-hidden border-2 transition ${meta.ring} ${
        dropTarget ? 'ring-2 ring-emerald-400/70' : ''
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDropTarget(true);
      }}
      onDragLeave={() => setDropTarget(false)}
      onDrop={(e) => handleDrop(e)}
    >
      {/* כותרת הקבוצה */}
      <header className={`relative ${meta.header}`}>
        <div
          className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3"
          onClick={() => selectedId && onMove(selectedId, teamId)}
          title={selectedId ? 'לחצו כדי להעביר לכאן את השחקן שנבחר' : undefined}
        >
          <div className="flex items-center gap-2">
            <span className="text-lg leading-none">{meta.emoji}</span>
            <h3 className="text-lg font-extrabold">{meta.name}</h3>
          </div>
          <div className="flex items-center gap-2 text-sm font-bold">
            {onRecolor && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setPaletteOpen((v) => !v);
                }}
                title="שינוי הצבע של הקבוצה, או החלפה עם קבוצה אחרת"
                aria-label="שינוי צבע הקבוצה"
                className="rounded-lg bg-black/15 p-1.5 transition hover:bg-black/30"
              >
                <Palette size={13} />
              </button>
            )}
            <span className="inline-flex items-center gap-1 rounded-lg bg-black/15 px-2 py-1 text-xs">
              <Users size={12} />
              <span className="font-mono tabular-nums">{stats.count}</span>
            </span>
            {adminView && (
              <span
                dir="ltr"
                className="rounded-lg bg-black/20 px-2 py-1 font-mono text-sm tabular-nums"
                title="סך כל הדירוגים בקבוצה"
              >
                {stats.total.toFixed(1)}
              </span>
            )}
          </div>
        </div>

        {paletteOpen && onRecolor && (
          <ColorPicker
            current={teamId}
            lineup={lineup}
            onPick={(to) => {
              onRecolor(to);
              setPaletteOpen(false);
            }}
            onClose={() => setPaletteOpen(false)}
          />
        )}
      </header>

      {/* רשימת השחקנים */}
      {/* flex-1 מצמיד את סיכום הקבוצה לתחתית הכרטיס — אחרת קבוצה עם פחות
          שורות מסיימת גבוה יותר, והסיכומים של שלוש הקבוצות לא מיושרים */}
      <ul className={`min-h-[9rem] flex-1 divide-y divide-slate-800/60 ${meta.softBg}`}>
        {playerIds.length === 0 && (
          <li className="px-4 py-10 text-center text-xs text-slate-500">
            גררו לכאן שחקנים
          </li>
        )}

        {playerIds.map((id, index) => {
          const player = byId.get(id);
          if (!player) return null;
          const bond = bondStatus(id, lineup, pool);
          const isSelected = selectedId === id;

          return (
            <li
              key={id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/player-id', id);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, id)}
              onClick={() => onSelect(id)}
              className={`flex cursor-grab items-center gap-2.5 px-3 py-2.5 transition active:cursor-grabbing ${
                isSelected
                  ? 'bg-emerald-500/20 ring-1 ring-emerald-400/60 ring-inset'
                  : 'hover:bg-white/[0.04]'
              }`}
              title="לחצו לבחירה, ואז לחצו על שחקן אחר כדי להחליף ביניהם"
            >
              <GripVertical size={14} className="shrink-0 text-slate-600" />

              {adminView && (
                <span className="w-4 shrink-0 text-center font-mono text-[11px] text-slate-500 tabular-nums">
                  {index + 1}
                </span>
              )}

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-slate-100">
                  {player.name}
                </span>
                {/* שורת החברים נשמרת גם למי שאין לו חבר בבריכה. בלי זה השורה
                    נמוכה ב-12 פיקסלים, והשחקנים בשלוש הקבוצות מפסיקים להיות
                    מיושרים זה מול זה — קבוצה עם פחות חברים מטפסת כלפי מעלה */}
                <span
                  className={`flex h-3 items-center gap-1 truncate text-[10px] ${
                    bond.together ? 'text-emerald-400/90' : 'text-amber-400/80'
                  }`}
                >
                  {bond.hasBond && (
                    <>
                      {bond.together ? <Link2 size={9} /> : <Unlink size={9} />}
                      חבר של {bond.partnerNames.join(', ')}
                      {!bond.together && ' · בקבוצה אחרת'}
                    </>
                  )}
                </span>
              </span>

              {adminView && <RatingBadge rating={player.rating} size="sm" />}
            </li>
          );
        })}
      </ul>

      {adminView && stats.count > 0 && (
        <footer className="grid grid-cols-3 divide-x divide-x-reverse divide-slate-800/70 border-t border-slate-800/70 bg-slate-950/50 text-center">
          <div className="px-2 py-2" title="סכום הדירוגים של כל השחקנים בקבוצה">
            <p className="font-mono text-base font-bold text-slate-100 tabular-nums">
              {stats.total.toFixed(1)}
            </p>
            <p className="text-[10px] text-slate-500">דירוג</p>
          </div>
          <div
            className="px-2 py-2"
            title={`${stats.bondsKept} זוגות חברים יחד × ${CHEMISTRY_BONUS_PER_BOND} נקודות`}
          >
            <p className="inline-flex items-center gap-1 font-mono text-base font-bold text-emerald-300 tabular-nums">
              <Link2 size={11} />+{stats.chemistryBonus.toFixed(1)}
            </p>
            <p className="text-[10px] text-slate-500">כימיה ({stats.bondsKept})</p>
          </div>
          <div className="px-2 py-2" title="דירוג + בונוס הכימיה — האומדן לחוזק האמיתי">
            <p className="font-mono text-base font-bold text-sky-300 tabular-nums">
              {stats.combined.toFixed(1)}
            </p>
            <p className="text-[10px] text-slate-500">משוקלל</p>
          </div>
        </footer>
      )}
    </section>
  );
}

/* -------------------------- בורר צבע לקבוצה -------------------------- */

/**
 * בחירת צבע חדש לקבוצה. צבע שכבר שייך לקבוצה אחרת אינו חסום —
 * בחירה בו מחליפה בין השתיים, וזו הדרך הטבעית לומר "שהם ישחקו בשחור".
 */
function ColorPicker({
  current,
  lineup,
  onPick,
  onClose,
}: {
  current: TeamId;
  lineup: Lineup;
  onPick: (to: TeamId) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-20" onClick={onClose} aria-hidden />
      <div className="absolute top-full left-3 z-30 mt-1 w-56 rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-2xl shadow-black/60">
        <p className="px-1 pb-1.5 text-[10px] font-bold text-slate-400">
          צבע הקבוצה
        </p>
        <ul className="grid grid-cols-2 gap-1">
          {ALL_TEAM_IDS.filter((t) => t !== current).map((t) => {
            const taken = t in lineup;
            return (
              <li key={t}>
                <button
                  onClick={() => onPick(t)}
                  className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-right text-[11px] font-semibold text-slate-200 transition hover:bg-slate-800"
                  title={
                    taken
                      ? `החלפת הצבעים בין ${TEAM_META[current].name} ל${TEAM_META[t].name}`
                      : `שינוי ל${TEAM_META[t].name}`
                  }
                >
                  <span className={`size-3 shrink-0 rounded-full ${TEAM_META[t].dot}`} />
                  <span className="truncate">{TEAM_META[t].name}</span>
                  {taken && <span className="mr-auto text-[9px] text-slate-500">החלפה</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
