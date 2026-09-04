import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  Database,
  FlaskConical,
  History,
  Shuffle,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import {
  allInLineup,
  isFillerId,
  lineupTeams,
  membersOf,
  normalizePlayers,
  recordLineup,
  teamsIn,
  type Filler,
  type Lineup,
  type MatchRecord,
  type Placements,
  type Player,
} from './types';
import { VARIETY_MEMORY, removeFromLineup } from './lib/balance';
import {
  STORAGE_KEYS,
  emptyDraft,
  normalizeDraft,
  normalizeSettings,
  type Draft,
} from './lib/storage';
import { isCloudConfigured } from './lib/supabase';
import { useLocalStorage } from './hooks/useLocalStorage';
import { useAuth } from './hooks/useAuth';
import { useSyncedStore } from './hooks/useSyncedStore';
import { todayISO } from './lib/format';
import { computeHistoryStats, streakByPlayer } from './lib/stats';
import { computePairChemistry, pairEffectMap } from './lib/pairs';
import {
  applyChanges,
  isCheckpoint,
  revertChanges,
  runCheck,
  type RatingChange,
} from './lib/ratingDrift';
import { RatingCheckPopup } from './components/RatingCheckPopup';
import { PRIORITIES_VERSION, normalizePriorities, type CriterionSetting } from './lib/criteria';
import { DEMO_PLAYERS, buildDemoHistory } from './lib/demoData';
import { PlayersView } from './components/PlayersView';
import { DrawView } from './components/DrawView';
import { HistoryView } from './components/HistoryView';
import { AnalysisView } from './components/AnalysisView';
import { PaymentsView } from './components/PaymentsView';
import { InstallButton } from './components/InstallButton';
import { BackupCard } from './components/BackupCard';
import { AuthGate, CloudNotConfigured, PasswordRecovery } from './components/AuthGate';
import { SyncBadge } from './components/SyncBadge';
import { Toast } from './components/ui';
import type { PlayerDraft } from './components/PlayerFormModal';

type Tab = 'players' | 'draw' | 'payments' | 'history' | 'analysis';

const TABS: { id: Tab; label: string; icon: typeof Users }[] = [
  { id: 'players', label: 'שחקנים', icon: Users },
  { id: 'draw', label: 'קבוצות', icon: Shuffle },
  { id: 'payments', label: 'תשלומים', icon: Wallet },
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
  /** נכנס בלי חשבון — מצב דוגמה בלבד, אין מה לסנכרן ואין מה לשמור */
  const isGuest = isCloudConfigured && !auth.userId;

  // טיוטה ישנה שנשמרה מקומית — משמשת רק להעברה חד-פעמית לענן
  const [legacyDraft, setLegacyDraft] = useLocalStorage<Draft | null>(STORAGE_KEYS.draft, null);

  // נתונים ישנים (friendOf יחיד) מומרים כאן לשדות החדשים
  const migratedPlayers = useMemo(() => normalizePlayers(realPlayers), [realPlayers]);

  const settings = useMemo(() => normalizeSettings(store.settings), [store.settings]);

  /** המחזור הנוכחי מגיע מההגדרות המסונכרנות, כדי שהטלפון והמחשב יראו אותו דבר */
  const realDraft = useMemo(
    () => (settings.round.matchDate ? settings.round : emptyDraft(todayISO())),
    [settings.round],
  );

  const setRealDraft = useCallback(
    (updater: (prev: Draft) => Draft) =>
      store.setSettings((prev) => {
        const base = normalizeSettings(prev);
        const current = base.round.matchDate ? base.round : emptyDraft(todayISO());
        return { ...base, round: updater(current) };
      }),
    [store],
  );

  const players = demoPlayers ?? migratedPlayers;
  const history = isDemo ? demoHistory : realHistory;
  const setHistory = isDemo ? setDemoHistory : setRealHistory;
  const draft = isDemo ? demoDraft : realDraft;
  const setDraft = isDemo ? setDemoDraft : setRealDraft;

  // העברה חד-פעמית של מחזור שנשמר מקומית לפני שהסנכרון הופעל
  const migratedRound = useRef(false);
  useEffect(() => {
    if (migratedRound.current || isDemo || store.status === 'loading') return;
    if (!legacyDraft?.selectedIds?.length || settings.round.matchDate) return;
    migratedRound.current = true;
    setRealDraft(() => normalizeDraft(legacyDraft, legacyDraft.matchDate || todayISO()));
    setLegacyDraft(null);
  }, [legacyDraft, settings.round.matchDate, isDemo, store.status, setRealDraft, setLegacyDraft]);

  /*
   * מעגנים את נקודת ההתחלה של תיקון הדירוגים פעם אחת. חייב להישמר ולא להיגזר
   * בכל טעינה: חותמת "עכשיו" שנוצרת מחדש בכל רינדור לעולם לא הייתה מאפשרת לאף
   * מחזור להיספר, ורגע התחלה שנגזר מההיסטוריה היה זוחל קדימה עם כל הגרלה חדשה.
   */
  const anchoredDrift = useRef(false);
  useEffect(() => {
    if (anchoredDrift.current || isDemo || store.status === 'loading') return;
    if (settings.ratingDriftSince) return;
    anchoredDrift.current = true;
    store.setSettings((prev) => ({ ...prev, ratingDriftSince: new Date().toISOString() }));
  }, [isDemo, store, settings.ratingDriftSince]);

  /** במצב דוגמה סופרים את כל ההיסטוריה המומצאת, אחרת אין מה להדגים */
  const driftSince = isDemo ? undefined : settings.ratingDriftSince;

  const [ratingCheck, setRatingCheck] = useState<{
    recordId: string;
    changes: RatingChange[];
  } | null>(null);

  // רצפי ניצחון/הפסד מההיסטוריה — מוצגים ליד השמות בזמן בחירת המשתתפים
  const streaks = useMemo(() => streakByPlayer(computeHistoryStats(history)), [history]);

  // אפקטים נלמדים לזוגות — זמינים להגרלה כשהקריטריון דלוק
  const pairEffects = useMemo(() => pairEffectMap(computePairChemistry(history)), [history]);

  // ההרכבים האחרונים ששוחקו — מהם ההגרלה מנסה להתרחק כדי לגוון
  const recentLineups = useMemo(
    () => history.slice(0, VARIETY_MEMORY).map(recordLineup),
    [history],
  );

  const priorities = useMemo(
    () => normalizePriorities(settings.priorities, settings.prioritiesVersion),
    [settings.priorities, settings.prioritiesVersion],
  );
  // כל שינוי מכוון חותם את הגרסה, כדי שמיגרציית ברירות המחדל לא תרוץ שוב עליו
  const setPriorities = useCallback(
    (next: CriterionSetting[]) =>
      store.setSettings((prev) => ({
        ...prev,
        priorities: next,
        prioritiesVersion: PRIORITIES_VERSION,
      })),
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
      lineup: prev.lineup ? removeFromLineup(prev.lineup, id) : null,
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
    // אורח חוזר אוטומטית למסך הפתיחה, כי התנאי שמעליו מתקיים שוב
    notify(isGuest ? 'יצאת ממצב דוגמה' : 'חזרת למאגר האמיתי');
  };

  /* ------------------------------ היסטוריה ---------------------------- */

  const saveToHistory = (lineup: Lineup, date: string, cancelledIds: string[]) => {
    // המשלימים לא נמצאים במאגר, אבל הם כן חלק מהקבוצות של הערב הזה
    const byId = new Map<string, { id: string; name: string; rating: number }>([
      ...players.map((p) => [p.id, p] as const),
      ...draft.fillers.map((g) => [g.id, g] as const),
    ]);
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
      teams: Object.fromEntries(
        lineupTeams(lineup).map((t) => [t, snapshot(membersOf(lineup, t))]),
      ),
      cancelled: snapshot(cancelledIds),
      substitutions: draft.substitutions
        .map((s) => ({ out: one(s.outId), in: one(s.inId) }))
        .filter((s): s is { out: NonNullable<typeof s.out>; in: NonNullable<typeof s.in> } =>
          Boolean(s.out && s.in),
        ),
    };
    setHistory((prev) => [record, ...prev]);
  };

  /**
   * מסמן תוצאה, ומיד אחריה מריץ את בדיקת הדירוגים אם המחזור הזה הוא כל שלישי.
   *
   * הכל קורה כאן ולא ב-useEffect בכוונה: הבדיקה חייבת לרוץ פעם אחת לכל סימון,
   * ואפקט שמסתכל על ההיסטוריה היה רץ שוב בכל סנכרון שמגיע ממכשיר אחר.
   */
  const setResult = (recordId: string, placements: Placements | null) => {
    const record = history.find((r) => r.id === recordId);

    // ניקוי תוצאה מבטל את התיקונים שהמחזור הזה גרר — אחרת הדירוג נשאר מזוהם
    // מראיה שכבר נמחקה, ואין שום דרך לדעת את זה בדיעבד
    const undone = !placements ? (record?.ratingCheck?.changes ?? []) : [];
    if (undone.length) applyToPlayers((prev) => revertChanges(prev, undone));

    const nextHistory = history.map((r) => {
      if (r.id !== recordId) return r;
      const next = { ...r };
      // התוצאה נשמרת רק בפורמט החדש; הישן נמחק כדי שלא יסתור אותו
      delete next.result;
      delete next.ratingCheck;
      if (placements) next.placements = placements;
      else delete next.placements;
      return next;
    });

    // ריק = נקודת ההתחלה עוד לא עוגנה, ואז אין בדיקות בכלל
    const canCheck = isDemo || !!settings.ratingDriftSince;
    const changes =
      placements && canCheck && isCheckpoint(nextHistory, recordId, driftSince)
        ? runCheck(players, nextHistory, driftSince)
        : null;

    if (changes) {
      if (changes.length) applyToPlayers((prev) => applyChanges(prev, changes));
      setHistory(() =>
        nextHistory.map((r) => (r.id === recordId ? { ...r, ratingCheck: { changes } } : r)),
      );
      setRatingCheck({ recordId, changes });
    } else {
      setHistory(() => nextHistory);
      if (undone.length) notify('התיקונים לדירוג בוטלו יחד עם התוצאה');
    }
  };

  /** ביטול ידני מהחלון — מחזיר את הדירוגים ומוחק את היומן מאותה הגרלה */
  const undoRatingCheck = () => {
    if (!ratingCheck) return;
    applyToPlayers((prev) => revertChanges(prev, ratingCheck.changes));
    setHistory((prev) =>
      prev.map((r) => {
        if (r.id !== ratingCheck.recordId) return r;
        const next = { ...r };
        delete next.ratingCheck;
        return next;
      }),
    );
    setRatingCheck(null);
    notify('הדירוגים הוחזרו כפי שהיו');
  };

  const restoreRecord = (record: MatchRecord) => {
    const existing = new Set(players.map((p) => p.id));
    // משלים נשמר בתוך ההגרלה עצמה, ולכן הוא משוחזר ממנה — לא מהמאגר
    const keep = (id: string) => existing.has(id) || isFillerId(id);

    const teams = teamsIn(record.teams);
    const lineup: Lineup = Object.fromEntries(
      teams.map((t) => [t, (record.teams[t] ?? []).map((p) => p.id).filter(keep)]),
    );

    const fillers: Filler[] = teams
      .flatMap((t) => record.teams[t] ?? [])
      .filter((p) => isFillerId(p.id))
      .map((p) => ({ id: p.id, name: p.name, rating: p.rating }));

    setDraft((prev) => ({
      ...prev,
      selectedIds: allInLineup(lineup).filter((id) => !isFillerId(id)),
      cancelledIds: (record.cancelled ?? []).map((p) => p.id).filter((id) => existing.has(id)),
      lineup,
      // ההגרלה ששוחזרה היא נקודת ההשוואה לעריכות שיבואו אחריה
      baseline: lineup,
      matchDate: record.date,
      teamCount: teams.length || prev.teamCount,
      fillers,
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

  // הגיע דרך קישור שחזור — קודם קובעים סיסמה חדשה
  if (isCloudConfigured && auth.recovering) {
    return <PasswordRecovery onSubmit={auth.setNewPassword} onCancel={auth.signOut} />;
  }

  // מצב דוגמה חי כולו בזיכרון ולא נוגע בענן, ולכן הוא לא דורש חשבון.
  // מי שלא נרשם רואה את מסך הפתיחה עד שהוא בוחר להיכנס לניסיון.
  if (isCloudConfigured && !auth.userId && !isDemo) {
    return (
      <AuthGate
        onSignIn={auth.signIn}
        onSignUp={auth.signUp}
        onForgotPassword={auth.requestPasswordReset}
        onTryDemo={enterDemo}
        notify={notify}
      />
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-7xl px-4 pb-16 sm:px-6">
      <header className="flex flex-col gap-4 py-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-emerald-500/15 p-2.5 text-2xl leading-none">⚽</div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-50">Teams FC</h1>
            <p className="text-xs text-slate-400">חלוקת קבוצות לכדורגל השבועי</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <InstallButton notify={notify} />
          {!isGuest && (
            <SyncBadge
              status={store.status}
              email={auth.email}
              lastSyncedAt={store.lastSyncedAt}
              error={store.error}
              onSignOut={auth.signOut}
            />
          )}
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
            {isGuest ? (
              <>
                <b>מצב דוגמה:</b> 21 שחקנים מומצאים, בלי חשבון. אפשר להגריל, לערוך ולשתף — אבל
                שום דבר לא נשמר, וברענון הכול מתאפס. חשבון שומר את המאגר שלך ומסנכרן בין מכשירים.
              </>
            ) : (
              <>
                <b>מצב דוגמה:</b> 21 שחקנים מומצאים למשחק ולהתנסות. שום דבר כאן לא נשמר ולא נוגע
                במאגר האמיתי שלך.
              </>
            )}
          </span>
          <button className="btn-ghost mr-auto !py-1.5 text-xs" onClick={exitDemo}>
            <X size={13} />
            {isGuest ? 'חזרה למסך הפתיחה' : 'יציאה ממצב דוגמה'}
          </button>
        </div>
      )}

      <nav className="mb-5 flex gap-0.5 rounded-2xl border border-slate-800/80 bg-slate-900/50 p-1.5 backdrop-blur sm:gap-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-1 rounded-xl px-1 py-2.5 text-xs font-bold transition sm:gap-2 sm:px-3 sm:text-sm ${
              tab === id
                ? 'bg-emerald-500 text-emerald-950 shadow-md shadow-emerald-500/20'
                : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
            }`}
          >
            {/* בטלפון מוותרים על האייקון כדי שהטקסט המלא ייכנס */}
            <Icon size={15} className="hidden shrink-0 sm:block" />
            <span className="truncate">{label}</span>
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
                  setRealDraft(() => emptyDraft(todayISO()));
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
            recentLineups={recentLineups}
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
            driftSince={driftSince}
            notify={notify}
          />
        )}

        {tab === 'payments' && (
          <PaymentsView
            players={players}
            roundPlayerIds={draft.selectedIds}
            matchDate={draft.matchDate}
            settings={settings}
            onChange={store.setSettings}
            notify={notify}
          />
        )}

        {tab === 'analysis' && <AnalysisView players={players} history={history} />}
      </main>

      {ratingCheck && (
        <RatingCheckPopup
          changes={ratingCheck.changes}
          onUndo={undoRatingCheck}
          onClose={() => setRatingCheck(null)}
        />
      )}

      <Toast message={toast} />
    </div>
  );
}
