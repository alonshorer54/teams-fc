import { useState } from 'react';
import { GripVertical, Link2, Unlink, Users } from 'lucide-react';
import { TEAM_META, type Lineup, type Player, type TeamId } from '../types';
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
}) {
  const meta = TEAM_META[teamId];
  const byId = new Map(pool.map((p) => [p.id, p]));
  const [dropTarget, setDropTarget] = useState(false);

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
      className={`card overflow-hidden border-2 transition ${meta.ring} ${
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
      <header
        className={`flex items-center justify-between gap-3 px-4 py-3 ${meta.header} cursor-pointer`}
        onClick={() => selectedId && onMove(selectedId, teamId)}
        title={selectedId ? 'לחצו כדי להעביר לכאן את השחקן שנבחר' : undefined}
      >
        <div className="flex items-center gap-2">
          <span className="text-lg leading-none">{meta.emoji}</span>
          <h3 className="text-lg font-extrabold">{meta.name}</h3>
        </div>
        <div className="flex items-center gap-2 text-sm font-bold">
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
      </header>

      {/* רשימת השחקנים */}
      <ul className={`min-h-[9rem] divide-y divide-slate-800/60 ${meta.softBg}`}>
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
                {bond.hasBond && (
                  <span
                    className={`flex items-center gap-1 truncate text-[10px] ${
                      bond.together ? 'text-emerald-400/90' : 'text-amber-400/80'
                    }`}
                  >
                    {bond.together ? <Link2 size={9} /> : <Unlink size={9} />}
                    חבר של {bond.partnerNames.join(', ')}
                    {!bond.together && ' · בקבוצה אחרת'}
                  </span>
                )}
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
