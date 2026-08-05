import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Database, FlaskConical, History, Shuffle, Users, X } from 'lucide-react';
import {
  TEAM_IDS,
  normalizePlayers,
  type Lineup,
  type MatchRecord,
  type Placements,
  type Player,
  type TeamId,
} from './types';
import { STORAGE_KEYS, emptyDraft, normalizeDraft, type Draft } from './lib/storage';
import { isCloudConfigured } from './lib/supabase';
import { useLocalStorage } from './hooks/useLocalStorage';
import { useAuth } from './hooks/useAuth';
import { useSyncedStore } from './hooks/useSyncedStore';
import { todayISO } from './lib/format';
import { computeHistoryStats, streakByPlayer } from './lib/stats';
import { computePairChemistry, pairEffectMap } from './lib/pairs';
import { normalizePriorities, type CriterionSetting } from './lib/criteria';
import { DEMO_PLAYERS, buildDemoHistory } from './lib/demoData';
import { PlayersView } from './components/PlayersView';
import { DrawView } from './components/DrawView';
import { HistoryView } from './components/HistoryView';
import { AnalysisView } from './components/AnalysisView';
import { BackupCard } from './components/BackupCard';
import { AuthGate, CloudNotConfigured } from './components/AuthGate';
import { SyncBadge } from './components/SyncBadge';
import { Toast } from './components/ui';
import type { PlayerDraft } from './components/PlayerFormModal';

type Tab = 'players' | 'draw' | 'history' | 'analysis';

const TABS: { id: Tab; label: string; icon: typeof Users }[] = [
  { id: 'players', label: 'שחקנים', icon: Users },
  { id: 'draw', label: 'כוחות', icon: Shuffle },
  { id: 'history', label: 'היסטוריה', icon: History },
  { id: 'analysis', label: 'מגמות', icon: BarChart3 },
];

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

function buildDemoPlayers(): Player[] {
  const ids = DEMO_PLAYERS.map(() => newId());
  return normalizePlayers(
    DEMO_PLAYERS.map((p, i) => ({
      id: ids[i],
      name: p.name,
      rating: p.rating,
      friendIds: p.friendOfIndex != null ? [ids[p.friendOfIndex]] : [],
      loveIds: p.loveIndex != null ? [ids[p.loveIndex]] : [],
      hateIds: p.hateIndex != null ? [ids[p.hateIndex]] : [],
      tags: p.tags ?? [],
    })),
  );
}

export default function App() {
  const auth = useAuth();
  const store = useSyncedStore(auth.userId);
  const { players: realPlayers, setPlayers, history: realHistory, setHistory: setRealHistory } = store;

  const [tab, setTab] = useState<Tab>('players');

  /**
   * מצב דוגמה: שחקנים ותוצאות חיים בזיכרון בלבד ולא נוגעים בנתונים האמיתיים
   * ולא בענן. יוצאים ממנו והכל נעלם.
   */
  const [demoPlayers, setDemoPlayers] = useState<Player[] | null>(null);
  const [demoHistory, setDemoHistory] = useState<MatchRecord[]>([]);
  const [demoDraft, setDemoDraft] = useState<Draft>(() => emptyDraft(todayISO()));
  const isDemo = demoPlayers !== null;

  const [storedDraft, setStoredDraft] = useLocalStorage<Draft>(
    STORAGE_KEYS.draft,
    emptyDraft(todayISO()),
  );

  // טיוטות שנשמרו לפני שנוספו שדות הביטולים והכימיה
  const realDraft = useMemo(() => normalizeDraft(storedDraft, todayISO()), [storedDraft]);

  // נתונים ישנים (friendOf יחיד) מומרים כאן לשדות החדשים
  const migratedPlayers = useMemo(() => normalizePlayers(realPlayers), [realPlayers]);

  const players = demoPlayers ?? migratedPlayers;
  const history = isDemo ? demoHistory : realHistory;
  const setHistory = isDemo ? setDemoHistory : setRealHistory;
  const draft = isDemo ? demoDraft : realDraft;
  const setDraft = isDemo ? setDemoDraft : setStoredDraft;

  // רצפי ניצחון/הפסד מההיסטוריה — מוצגים ליד השמות בזמן בחירת המשתתפים
  const streaks = useMemo(() => streakByPlayer(computeHistoryStats(history)), [history]);

  // אפקטים נלמדים לזוגות — זמינים להגרלה כשהקריטריון דלוק
  const pairEffects = useMemo(() => pairEffectMap(computePairChemistry(history)), [history]);

  // סדר העדיפויות מסתנכרן בענן יחד עם השחקנים וההיסטוריה
  const priorities = useMemo(
    () => normalizePriorities(store.settings.priorities),
    [store.settings.priorities],
  );
  const setPriorities = useCallback(
    (next: CriterionSetting[]) => store.setSettings((prev) => ({ ...prev, priorities: next })),
    [store],
  );

  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  /* ------------------------------ שחקנים ------------------------------ */

  /**
   * כל כתיבה עוברת נרמול משני הצדדים:
   * לפני העדכון — כדי שהמעדכן יקבל שחקנים עם כל השדות גם אם באחסון עוד יושב
   * הפורמט הישן; ואחרי — כדי שהחברויות יישארו דו-כיווניות.
   */
  const applyToPlayers = (updater: (prev: Player[]) => Player[]) => {
    const wrapped = (prev: Player[]) => normalizePlayers(updater(normalizePlayers(prev)));
    if (isDemo) setDemoPlayers((prev) => wrapped(prev ?? []));
    else setPlayers(wrapped);
  };

  const createPlayer = (d: PlayerDraft) => {
    applyToPlayers((prev) => [...prev, { id: newId(), ...d }]);
    notify(`${d.name} נוסף${isDemo ? ' (מצב דוגמה)' : ' למאגר'}`);
  };

  const updatePlayer = (id: string, d: PlayerDraft) => {
    applyToPlayers((prev) =>
      prev.map((p) => {
        if (p.id === id) return { ...p, ...d };
        // מי שהוסר מרשימת החברים צריך לאבד את הקשר גם מהצד שלו
        if (!d.friendIds.includes(p.id) && p.friendIds.includes(id)) {
          return { ...p, friendIds: p.friendIds.filter((x) => x !== id) };
        }
        return p;
      }),
    );
    notify('הפרטים עודכנו');
  };

  const deletePlayer = (id: string) => {
    // normalizePlayers מנקה לבד הפניות לשחקן שנמחק
    applyToPlayers((prev) => prev.filter((p) => p.id !== id));
    setDraft((prev) => ({
      ...prev,
      selectedIds: prev.selectedIds.filter((x) => x !== id),
      cancelledIds: prev.cancelledIds.filter((x) => x !== id),
      lineup: prev.lineup ? stripFromLineup(prev.lineup, id) : null,
    }));
    notify('השחקן נמחק');
  };

  const enterDemo = () => {
    const demo = buildDemoPlayers();
    setDemoPlayers(demo);
    setDemoHistory(buildDemoHistory(demo));
    setDemoDraft(emptyDraft(todayISO()));
    setTab('draw');
    notify('מצב דוגמה — שום דבר כאן לא נשמר');
  };

  const exitDemo = () => {
    setDemoPlayers(null);
    setDemoHistory([]);
    setDemoDraft(emptyDraft(todayISO()));
    setTab('players');
    notify('חזרת למאגר האמיתי');
  };

  /* ------------------------------ היסטוריה ---------------------------- */

  const saveToHistory = (lineup: Lineup, date: string, cancelledIds: string[]) => {
    const byId = new Map(players.map((p) => [p.id, p]));
    const one = (id: string) => {
      const p = byId.get(id);
      return p ? { id: p.id, name: p.name, rating: p.rating } : null;
    };
    const snapshot = (ids: string[]) =>
      ids.map(one).filter((p): p is NonNullable<ReturnType<typeof one>> => !!p);

    const record: MatchRecord = {
      id: newId(),
      savedAt: new Date().toISOString(),
      date,
      teams: {
        white: snapshot(lineup.white),
        black: snapshot(lineup.black),
        colored: snapshot(lineup.colored),
      },
      cancelled: snapshot(cancelledIds),
      substitutions: draft.substitutions
        .map((s) => ({ out: one(s.outId), in: one(s.inId) }))
        .filter((s): s is { out: NonNullable<typeof s.out>; in: NonNullable<typeof s.in> } =>
          Boolean(s.out && s.in),
        ),
    };
    setHistory((prev) => [record, ...prev]);
  };

  const setResult = (recordId: string, placements: Placements | null) => {
    setHistory((prev) =>
      prev.map((r) => {
        if (r.id !== recordId) return r;
        const next = { ...r };
        // התוצאה נשמרת רק בפורמט החדש; הישן נמחק כדי שלא יסתור אותו
        delete next.result;
        if (placements) next.placements = placements;
        else delete next.placements;
        return next;
      }),
    );
  };

  const restoreRecord = (record: MatchRecord) => {
    const existing = new Set(players.map((p) => p.id));
    const pick = (t: TeamId) => record.teams[t].map((p) => p.id).filter((id) => existing.has(id));
    const lineup: Lineup = { white: pick('white'), black: pick('black'), colored: pick('colored') };
    setDraft((prev) => ({
      ...prev,
      selectedIds: TEAM_IDS.flatMap((t) => lineup[t]),
      cancelledIds: (record.cancelled ?? []).map((p) => p.id).filter((id) => existing.has(id)),
      lineup,
      // ההגרלה ששוחזרה היא נקודת ההשוואה לעריכות שיבואו אחריה
      baseline: lineup,
      matchDate: record.date,
    }));
    setTab('draw');
  };

  /* -------------------------------- UI -------------------------------- */

  // ממתינים לבדיקת ההתחברות כדי לא להבהב בין מסך הכניסה לאפליקציה
  if (!auth.ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">
        טוען...
      </div>
    );
  }

  if (isCloudConfigured && !auth.userId) {
    return <AuthGate onSignIn={auth.signIn} onSignUp={auth.signUp} />;
  }

  return (
    <div className="mx-auto min-h-screen max-w-7xl px-4 pb-16 sm:px-6">
      <header className="flex flex-col gap-4 py-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-emerald-500/15 p-2.5 text-2xl leading-none">⚽</div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-50">Teams FC</h1>
            <p className="text-xs text-slate-400">חלוקת כוחות לכדורגל השבועי</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isDemo && (
            <button className="btn-ghost text-xs" onClick={enterDemo}>
              <FlaskConical size={14} />
              מצב דוגמה
            </button>
          )}
          <SyncBadge
            status={store.status}
            email={auth.email}
            lastSyncedAt={store.lastSyncedAt}
            error={store.error}
            onSignOut={auth.signOut}
          />
        </div>
      </header>

      {!isCloudConfigured && <CloudNotConfigured />}

      {isCloudConfigured && auth.userId && !store.settingsSynced && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-200">
          <Database size={15} className="mt-0.5 shrink-0" />
          <span>
            <b>סדר העדיפויות עדיין לא מסתנכרן.</b> חסרה עמודה במסד הנתונים — הריצו את{' '}
            <code className="rounded bg-black/30 px-1">supabase-add-settings.sql</code> ב-SQL Editor
            של Supabase, ורעננו. השחקנים וההיסטוריה מסתנכרנים כרגיל.
          </span>
        </div>
      )}

      {isDemo && (
        <div className="mb-4 flex flex-wrap items-center gap-2.5 rounded-xl border border-violet-500/40 bg-violet-500/10 px-4 py-3 text-xs text-violet-200">
          <FlaskConical size={15} className="shrink-0" />
          <span>
            <b>מצב דוגמה:</b> 21 שחקנים מומצאים למשחק ולהתנסות. שום דבר כאן לא נשמר ולא נוגע במאגר
            האמיתי שלך.
          </span>
          <button className="btn-ghost mr-auto !py-1.5 text-xs" onClick={exitDemo}>
            <X size={13} />
            יציאה ממצב דוגמה
          </button>
        </div>
      )}

      <nav className="mb-5 flex gap-1 rounded-2xl border border-slate-800/80 bg-slate-900/50 p-1.5 backdrop-blur">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition ${
              tab === id
                ? 'bg-emerald-500 text-emerald-950 shadow-md shadow-emerald-500/20'
                : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
            }`}
          >
            <Icon size={16} />
            {label}
            {id === 'history' && history.length > 0 && (
              <span
                className={`rounded-md px-1.5 font-mono text-[10px] tabular-nums ${
                  tab === id ? 'bg-emerald-900/25' : 'bg-slate-700/70'
                }`}
              >
                {history.length}
              </span>
            )}
          </button>
        ))}
      </nav>

      <main>
        {tab === 'players' && (
          <div className="space-y-4">
            <PlayersView
              players={players}
              onCreate={createPlayer}
              onUpdate={updatePlayer}
              onDelete={deletePlayer}
            />
            {!isDemo && (
              <BackupCard
                players={players}
                history={history}
                notify={notify}
                onImport={(nextPlayers, nextHistory) => {
                  void store.flush(nextPlayers, nextHistory);
                  setStoredDraft(emptyDraft(todayISO()));
                }}
              />
            )}
          </div>
        )}

        {tab === 'draw' && (
          <DrawView
            players={players}
            draft={draft}
            setDraft={setDraft}
            streaks={streaks}
            pairEffects={pairEffects}
            priorities={priorities}
            setPriorities={setPriorities}
            onSaveHistory={saveToHistory}
            notify={notify}
            isDemo={isDemo}
          />
        )}

        {tab === 'history' && (
          <HistoryView
            history={history}
            onDelete={(id) => {
              setHistory((prev) => prev.filter((r) => r.id !== id));
              notify('ההגרלה נמחקה');
            }}
            onSetResult={setResult}
            onRestore={restoreRecord}
            notify={notify}
          />
        )}

        {tab === 'analysis' && <AnalysisView players={players} history={history} />}
      </main>

      <Toast message={toast} />
    </div>
  );
}

function stripFromLineup(lineup: Lineup, playerId: string): Lineup {
  return {
    white: lineup.white.filter((id) => id !== playerId),
    black: lineup.black.filter((id) => id !== playerId),
    colored: lineup.colored.filter((id) => id !== playerId),
  };
}
