import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  Database,
  Handshake,
  LogOut,
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
  squadOnly,
  teamsIn,
  withCurrentNames,
  type Filler,
  type Lineup,
  type MatchRecord,
  type Placements,
  type Player,
} from './types';
import { VARIETY_MEMORY, lineupKey, removeFromLineup } from './lib/balance';
import {
  STORAGE_KEYS,
  emptyDraft,
  emptyPayments,
  normalizeDraft,
  normalizeSettings,
  type Draft,
  type PaymentRound,
} from './lib/storage';
import { isCloudConfigured } from './lib/supabase';
import { useLocalStorage } from './hooks/useLocalStorage';
import { useAuth } from './hooks/useAuth';
import { answerInvitation, useSquads, type Squad } from './hooks/useSquads';
import { useSyncedStore } from './hooks/useSyncedStore';
import { formatHebrewDate, rollRoundDate, todayISO } from './lib/format';
import { computeHistoryStats, streakByPlayer } from './lib/stats';
import { computePairChemistry, pairEffectMap } from './lib/pairs';
import {
  DRIFT_FROM_START,
  applyChanges,
  countedRounds,
  isCheckpoint,
  replayChecks,
  replayFromStart,
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
import { AuthGate, CloudNotConfigured } from './components/AuthGate';
import { SharingCard } from './components/SharingCard';
import { SyncBadge } from './components/SyncBadge';
import { ConfirmDialog, Toast } from './components/ui';
import { FullPhotoContext } from './lib/fullPhotoContext';
import { deleteFullPhoto, loadFullPhoto, saveFullPhoto } from './lib/fullPhotos';
import { SharedPhotoModal } from './components/SharedPhotoModal';
import type { PlayerDraft } from './components/PlayerFormModal';
import type { NewPlayerDraft } from './components/PasteListModal';

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
      positions: p.positions ?? ['any'],
    })),
  );
}

const SQUAD_KEY = 'kohot.squad.v1';

/**
 * Signs in and picks the squad, then mounts the app for that squad. The app is keyed by the
 * squad, so switching squads starts it fresh: nothing synced for one squad — local cache,
 * pending saves — can leak into another.
 */
export default function App() {
  const auth = useAuth();
  const { squads, helping, invitations, ready, reload } = useSquads(
    auth.claimReady ? auth.userId : null,
    auth.claimedAt,
  );
  const [chosen, setChosen] = useLocalStorage<string | null>(SQUAD_KEY, null);
  const [answerError, setAnswerError] = useState<string | null>(null);

  if (!auth.ready || !auth.claimReady || !ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">
        טוען...
      </div>
    );
  }

  // An invitation is answered before anything else opens: nobody becomes a helper of a
  // squad, or lands in one, without saying yes
  const invitation = invitations[0];
  if (invitation && auth.userId) {
    const answer = async (accept: boolean) => {
      const err = await answerInvitation(invitation.ownerId, auth.userId!, accept);
      if (err) {
        setAnswerError(err);
        return;
      }
      setAnswerError(null);
      if (accept) setChosen(invitation.ownerId);
      reload();
    };
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="card w-full max-w-md p-7 text-center">
          <div className="mx-auto mb-3 w-fit rounded-2xl bg-sky-500/15 p-3 text-sky-300">
            <Handshake size={28} />
          </div>
          <h1 className="text-xl font-extrabold text-slate-50">הזמנה לעזור בניהול קבוצה</h1>
          <p className="mt-2 text-sm text-slate-300">
            <span dir="ltr" className="font-semibold">
              {invitation.label}
            </span>{' '}
            הזמין אותך לעזור: הגרלות, תוצאות ותשלומים.
          </p>
          {answerError && (
            <p className="mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{answerError}</p>
          )}
          <div className="mt-6 flex gap-2">
            <button className="btn-primary flex-1" onClick={() => answer(true)}>
              הצטרפות
            </button>
            <button className="btn-ghost flex-1" onClick={() => answer(false)}>
              לא, תודה
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Someone who helps a squad and hasn't chosen yet most likely came to help
  const active = squads.find((s) => s.ownerId === chosen) ?? helping[0] ?? squads[0] ?? null;

  return (
    <SquadApp
      key={active?.ownerId ?? 'signed-out'}
      auth={auth}
      squad={active}
      squads={squads}
      onSelectSquad={setChosen}
      onLeftSquad={() => {
        setChosen(auth.userId);
        reload();
      }}
    />
  );
}

function SquadApp({
  auth,
  squad,
  squads,
  onSelectSquad,
  onLeftSquad,
}: {
  auth: ReturnType<typeof useAuth>;
  /** null when signed out (the opening screen, or the demo) */
  squad: Squad | null;
  squads: Squad[];
  onSelectSquad: (ownerId: string) => void;
  /** A helper stopped helping this squad */
  onLeftSquad: () => void;
}) {
  const [confirmLeave, setConfirmLeave] = useState(false);
  const isOwner = squad?.isOwner ?? true;
  const store = useSyncedStore(squad?.ownerId ?? null, isOwner);
  const { players: realPlayers, setPlayers, history: realHistory, setHistory: setRealHistory } = store;

  // A helper has no players tab: existing players are the owner's to edit
  const tabs = isOwner ? TABS : TABS.filter((t) => t.id !== 'players');
  const [tab, setTab] = useState<Tab>(isOwner ? 'players' : 'draw');

  /**
   * מצב דוגמה: שחקנים ותוצאות חיים בזיכרון בלבד ולא נוגעים בנתונים האמיתיים
   * ולא בענן. יוצאים ממנו והכל נעלם.
   */
  const [demoPlayers, setDemoPlayers] = useState<Player[] | null>(null);
  const [demoHistory, setDemoHistory] = useState<MatchRecord[]>([]);
  const [demoDraft, setDemoDraft] = useState<Draft>(() => emptyDraft(todayISO()));
  const [demoPayments, setDemoPayments] = useState<PaymentRound>(() => emptyPayments(''));
  const isDemo = demoPlayers !== null;
  /** נכנס בלי חשבון — מצב דוגמה בלבד, אין מה לסנכרן ואין מה לשמור */
  const isGuest = isCloudConfigured && !auth.userId;

  // טיוטה ישנה שנשמרה מקומית — משמשת רק להעברה חד-פעמית לענן
  const [legacyDraft, setLegacyDraft] = useLocalStorage<Draft | null>(STORAGE_KEYS.draft, null);

  // נתונים ישנים (friendOf יחיד) מומרים כאן לשדות החדשים
  const migratedPlayers = useMemo(() => normalizePlayers(realPlayers), [realPlayers]);

  const settings = useMemo(() => normalizeSettings(store.settings), [store.settings]);

  /**
   * מקדם מחזור שהתאריך שלו כבר עבר אל השבוע הבא, כדי ש"המחזור הקרוב" באמת יהיה
   * הקרוב ולא הערב שכבר שוחק.
   *
   * לא מקדמים כשיש חלוקה שעוד לא נשמרה להיסטוריה: אז המחזור עדיין פתוח, ושינוי
   * התאריך מתחת לידיים היה גורם לשמירה של ערב שכבר שוחק תחת התאריך של הבא.
   */
  const rollRound = useCallback(
    (round: Draft): Draft => {
      const pending = !!round.lineup && !realHistory.some((r) => r.date === round.matchDate);
      if (pending) return round;
      const date = rollRoundDate(round.matchDate);
      return date === round.matchDate ? round : { ...round, matchDate: date };
    },
    [realHistory],
  );

  /** המחזור הנוכחי מגיע מההגדרות המסונכרנות, כדי שהטלפון והמחשב יראו אותו דבר */
  const realDraft = useMemo(
    () => (settings.round.matchDate ? rollRound(settings.round) : emptyDraft(todayISO())),
    [settings.round, rollRound],
  );

  const setRealDraft = useCallback(
    (updater: (prev: Draft) => Draft) =>
      store.setSettings((prev) => {
        const base = normalizeSettings(prev);
        // אותו קידום כמו בתצוגה, אחרת כל עדכון היה מחזיר את התאריך הישן
        const current = base.round.matchDate ? rollRound(base.round) : emptyDraft(todayISO());
        return { ...base, round: updater(current) };
      }),
    [store, rollRound],
  );

  const setRealPayments = useCallback(
    (updater: (prev: PaymentRound) => PaymentRound) =>
      store.setSettings((prev) => {
        const base = normalizeSettings(prev);
        return { ...base, payments: updater(base.payments) };
      }),
    [store],
  );

  const players = demoPlayers ?? migratedPlayers;
  // שמות לפי המאגר של היום — רק השמות, כדי ששינוי דירוג לא יבנה את ההיסטוריה מחדש
  const namesKey = JSON.stringify(players.map((p) => [p.id, p.name]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const names = useMemo(() => players.map((p) => ({ id: p.id, name: p.name })), [namesKey]);
  const rawHistory = isDemo ? demoHistory : realHistory;
  const history = useMemo(() => withCurrentNames(rawHistory, names), [rawHistory, names]);
  const setHistory = isDemo ? setDemoHistory : setRealHistory;
  const draft = isDemo ? demoDraft : realDraft;
  const setDraft = isDemo ? setDemoDraft : setRealDraft;

  // העברה חד-פעמית של מחזור שנשמר מקומית לפני שהסנכרון הופעל
  const migratedRound = useRef(false);
  useEffect(() => {
    if (migratedRound.current || isDemo || !isOwner || store.status === 'loading') return;
    if (!legacyDraft?.selectedIds?.length || settings.round.matchDate) return;
    migratedRound.current = true;
    setRealDraft(() => normalizeDraft(legacyDraft, legacyDraft.matchDate || todayISO()));
    setLegacyDraft(null);
  }, [legacyDraft, settings.round.matchDate, isDemo, isOwner, store.status, setRealDraft, setLegacyDraft]);

  /** במצב דוגמה סופרים את כל ההיסטוריה המומצאת, אחרת אין מה להדגים */
  const driftSince = isDemo ? undefined : settings.ratingDriftSince;

  const [ratingCheck, setRatingCheck] = useState<{
    recordId: string;
    changes: RatingChange[];
  } | null>(null);

  /** מה זז כשתיקון הדירוגים הורץ מחדש על כל ההיסטוריה — מוצג פעם אחת */
  const [replaySummary, setReplaySummary] = useState<RatingChange[] | null>(null);

  /*
   * תיקון הדירוגים סופר את כל ההיסטוריה, גם מלפני שהתכונה נוספה. מי שעוד מחזיק
   * עוגן אחר (או ריק) מקבל פעם אחת הרצה מחדש מההתחלה, והעוגן נקבע ל"מההתחלה"
   * כדי שזה לא יקרה שוב. לפי משתמש: התחברות לחשבון אחר בודקת את הנתונים שלו.
   */
  const replayedFor = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    // Rewriting every rating is the owner's call, not something a helper's device does
    if (isDemo || !isOwner || store.status === 'loading' || store.status === 'error') return;
    if (replayedFor.current === auth.userId) return;
    if (settings.ratingDriftSince === DRIFT_FROM_START) return;
    replayedFor.current = auth.userId;

    const replayed = replayFromStart(migratedPlayers, realHistory);
    const after = new Map(replayed.players.map((p) => [p.id, p.rating]));
    const moved: RatingChange[] = migratedPlayers
      .filter((p) => (after.get(p.id) ?? p.rating) !== p.rating)
      .map((p) => ({
        playerId: p.id,
        name: p.name,
        from: p.rating,
        to: after.get(p.id) ?? p.rating,
        gauge: 0,
        recent: [],
      }));

    if (moved.length) setPlayers(() => normalizePlayers(replayed.players));
    setRealHistory(() => replayed.history);
    store.setSettings((prev) => ({ ...prev, ratingDriftSince: DRIFT_FROM_START }));
    // משתמש חדש בלי תוצאות לא צריך חלון על משהו שלא קרה
    if (countedRounds(realHistory).length) setReplaySummary(moved);
  }, [
    isDemo,
    isOwner,
    store,
    auth.userId,
    settings.ratingDriftSince,
    migratedPlayers,
    realHistory,
    setPlayers,
    setRealHistory,
  ]);

  // הסטטיסטיקות והמגמות סופרות רק את מי שעדיין במאגר; הערבים עצמם בהיסטוריה
  // נשארים מלאים. לפי המזהים ולא לפי השחקנים, כדי ששינוי דירוג לא יבנה הכל מחדש
  const squadKey = players.map((p) => p.id).join(',');
  const squadHistory = useMemo(() => {
    const ids = new Set(squadKey.split(','));
    return history.map((r) => squadOnly(r, (id) => ids.has(id)));
  }, [history, squadKey]);

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

  /** של מי התמונות המלאות בענן. במצב דוגמה — רק בזיכרון של הדף */
  const photoOwner = isDemo ? null : (squad?.ownerId ?? null);
  const loadFull = useCallback(
    (playerId: string, small: string | undefined) => loadFullPhoto(photoOwner, playerId, small),
    [photoOwner],
  );

  /** התמונה המלאה (להגדלה) נשמרת בטבלה נפרדת, אחרי שהעיגול כבר אצל השחקן */
  const storeFullPhoto = (id: string, small: string | undefined, full: string | undefined) => {
    if (!full || !small) return;
    void saveFullPhoto(photoOwner, id, full, small).then((ok) => {
      if (!ok) notify('⚠️ התמונה נשמרה, אבל הגרסה המלאה להגדלה לא נשמרה בענן');
    });
  };

  const createPlayer = (d: PlayerDraft) => {
    // התמונה המלאה לא נכנסת לשחקן עצמו — היא גדולה מדי למסמך שמסתנכרן
    const { photoFull, ...draft } = d;
    const id = newId();
    applyToPlayers((prev) => [...prev, { id, ...draft }]);
    storeFullPhoto(id, draft.photo, photoFull);
    notify(`${d.name} נוסף${isDemo ? ' (מצב דוגמה)' : ' למאגר'}`);
  };

  /** שחקנים שהודבקו מוואטסאפ ולא היו במאגר. המזהים חוזרים כדי לסמן אותם במחזור */
  const addPlayers = (drafts: NewPlayerDraft[]): string[] => {
    const fresh: Player[] = drafts.map((d) => ({
      id: newId(),
      name: d.name,
      rating: d.rating,
      friendIds: [],
      loveIds: [],
      hateIds: [],
      positions: ['any'],
    }));
    applyToPlayers((prev) => [...prev, ...fresh]);
    notify(
      fresh.length === 1
        ? `${fresh[0].name} נוסף למאגר`
        : `${fresh.length} שחקנים חדשים נוספו למאגר`,
    );
    return fresh.map((p) => p.id);
  };

  const updatePlayer = (id: string, d: PlayerDraft) => {
    const { photoFull, ...draft } = d;
    if (!draft.photo && players.find((p) => p.id === id)?.photo) void deleteFullPhoto(photoOwner, id);
    else storeFullPhoto(id, draft.photo, photoFull);
    applyToPlayers((prev) =>
      prev.map((p) => {
        if (p.id === id) return { ...p, ...draft };
        // מי שהוסר מרשימת החברים צריך לאבד את הקשר גם מהצד שלו
        if (!d.friendIds.includes(p.id) && p.friendIds.includes(id)) {
          return { ...p, friendIds: p.friendIds.filter((x) => x !== id) };
        }
        return p;
      }),
    );
    notify('הפרטים עודכנו');
  };

  const setPlayerPhoto = (id: string, photo: string, full?: string) => {
    applyToPlayers((prev) => prev.map((p) => (p.id === id ? { ...p, photo } : p)));
    storeFullPhoto(id, photo, full);
    const name = players.find((p) => p.id === id)?.name;
    notify(name ? `התמונה של ${name} נשמרה` : 'התמונה נשמרה');
  };

  const deletePlayer = (id: string) => {
    if (players.find((p) => p.id === id)?.photo) void deleteFullPhoto(photoOwner, id);
    // normalizePlayers מנקה לבד הפניות לשחקן שנמחק
    applyToPlayers((prev) => prev.filter((p) => p.id !== id));
    setDraft((prev) => ({
      ...prev,
      selectedIds: prev.selectedIds.filter((x) => x !== id),
      cancelledIds: prev.cancelledIds.filter((x) => x !== id),
      substitutions: prev.substitutions.filter((s) => s.inId !== id && s.outId !== id),
      lineup: prev.lineup ? removeFromLineup(prev.lineup, id) : null,
    }));
    notify('השחקן נמחק');
  };

  const enterDemo = () => {
    const demo = buildDemoPlayers();
    // מריצים את הבדיקות שכבר היו רצות על ההיסטוריה המומצאת. בלעדיהן הדוגמה
    // מציגה מדים מנופחים שלא יכולים להיווצר בשימוש אמיתי, שבו כל בדיקה צורכת
    const seeded = replayChecks(demo, buildDemoHistory(demo));
    setDemoPlayers(seeded.players);
    setDemoHistory(seeded.history);
    setDemoDraft(emptyDraft(todayISO()));
    setDemoPayments(emptyPayments(''));
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

  /** מחזיר הודעה כשיש משהו לומר מעבר ל"נשמר" */
  const saveToHistory = (lineup: Lineup, date: string, cancelledIds: string[]): string | undefined => {
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

    // הגבייה עוברת לערב הזה לבד (ראו האפקט של latestRecord). מי שלא שילם על
    // הערב הקודם יוצא מהרשימה — אז אומרים את זה, כדי שהחוב לא ייעלם בשקט
    const previous = isDemo ? demoPayments : settings.payments;
    if (previous.matchDate && previous.matchDate < date) {
      const owing = (previous.playerIds ?? [])
        .filter((id) => !previous.paid[id])
        .map((id) => players.find((p) => p.id === id)?.name)
        .filter((name): name is string => !!name);
      if (owing.length) {
        // הודעה קופצת לא מחזיקה רשימה ארוכה — חמישה שמות, והשאר במספר
        const shown = owing.slice(0, 5).join(', ');
        const more = owing.length > 5 ? ` ועוד ${owing.length - 5}` : '';
        return `הקבוצות נשמרו והגבייה עברה לערב הזה. על ${formatHebrewDate(previous.matchDate)} עוד לא שילמו: ${shown}${more}`;
      }
    }
  };

  /** ההגרלה האחרונה שנשמרה — לפי תאריך, ובאותו תאריך זו שנשמרה אחרונה */
  const latestRecord = useMemo(
    () =>
      history.reduce<MatchRecord | null>(
        (best, r) =>
          !best || r.date > best.date || (r.date === best.date && r.savedAt > best.savedAt)
            ? r
            : best,
        null,
      ),
    [history],
  );

  /**
   * רשימת התשלום היא תמיד מי ששיחק בהגרלה האחרונה שנשמרה. ערב חדש מחליף את
   * הגבייה מיד — גם אם מישהו עוד חייב על הקודם — ושמירה חוזרת של אותו ערב
   * (תיקון בקבוצות) מעדכנת את הרשימה ומשאירה את מי שכבר שילם.
   *
   * אפקט ולא קריאה מתוך השמירה: כך גם גבייה שאופסה, נמחקה או נשארה מאחור
   * בגרסה ישנה מתיישרת לבד, בלי לשמור את הקבוצות פעם נוספת.
   */
  useEffect(() => {
    if (!latestRecord || (!isDemo && store.status === 'loading')) return;
    const current = isDemo ? demoPayments : settings.payments;
    // גבייה על ערב חדש יותר מכל מה שבהיסטוריה היא של הגרלה שנמחקה — היא מוחלפת
    // כמו כל ערב אחר שאינו האחרון

    const playerIds = allInLineup(recordLineup(latestRecord)).filter((id) => !isFillerId(id));
    const sameEvening = current.matchDate === latestRecord.date;
    // הערב הזה כבר שולם ונסגר — לא גובים ממנו שוב
    if (sameEvening && current.playerIds?.length === 0) return;
    const listed = current.playerIds ?? [];
    if (
      sameEvening &&
      listed.length === playerIds.length &&
      playerIds.every((id) => listed.includes(id))
    ) {
      return;
    }

    // גבייה חדשה מתחילה נקייה — סימונים של ערב קודם לא עוברים אליה
    const keep = new Set(sameEvening ? playerIds : []);
    const apply = (base: PaymentRound): PaymentRound => ({
      ...base,
      matchDate: latestRecord.date,
      playerIds,
      paid: Object.fromEntries(Object.entries(base.paid).filter(([id]) => keep.has(id))),
    });
    if (isDemo) setDemoPayments(apply);
    else setRealPayments(apply);
  }, [latestRecord, isDemo, store.status, demoPayments, settings.payments, setRealPayments]);

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
        ? runCheck(players, nextHistory, driftSince, recordId)
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

    // הערב נגמר ויש לו תוצאה — המחזור מתנקה לקראת הבא. רק כשהחלוקה שעל המסך
    // היא בדיוק זו שסומנה: תוצאה למחזור ישן לא מוחקת מחזור חדש שכבר בבנייה
    const current = draft.lineup && lineupKey(draft.lineup);
    if (placements && record && current === lineupKey(recordLineup(record))) {
      setDraft((prev) => ({ ...emptyDraft(prev.matchDate), teamCount: prev.teamCount }));
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

  // מצב דוגמה חי כולו בזיכרון ולא נוגע בענן, ולכן הוא לא דורש חשבון.
  // מי שלא נרשם רואה את מסך הפתיחה עד שהוא בוחר להיכנס לניסיון.
  if (isCloudConfigured && !auth.userId && !isDemo) {
    return (
      <AuthGate onGoogle={auth.signInWithGoogle} onTryDemo={enterDemo} notify={notify} />
    );
  }

  return (
    <FullPhotoContext.Provider value={loadFull}>
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
          {!isDemo && squads.length > 1 && squad && (
            <select
              className="input w-auto max-w-[14rem] py-1.5 text-xs font-semibold"
              value={squad.ownerId}
              onChange={(e) => onSelectSquad(e.target.value)}
              aria-label="קבוצה"
            >
              {squads.map((s) => (
                <option key={s.ownerId} value={s.ownerId}>
                  {s.label}
                </option>
              ))}
            </select>
          )}
          {!isDemo && !isOwner && (
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-sky-500/30 bg-sky-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-sky-200">
              <Handshake size={13} />
              עוזר
              <button
                className="ms-1 cursor-pointer rounded p-0.5 text-sky-300 hover:bg-sky-500/20 hover:text-white"
                title="יציאה מהקבוצה"
                aria-label="יציאה מהקבוצה"
                onClick={() => setConfirmLeave(true)}
              >
                <LogOut size={12} />
              </button>
            </span>
          )}
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
        {tabs.map(({ id, label, icon: Icon }) => (
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
              onSetPhoto={setPlayerPhoto}
              notify={notify}
            />
            {!isDemo && squad && (
              <SharingCard ownerId={squad.ownerId} ownerEmail={auth.email} notify={notify} />
            )}
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
            onAddPlayers={addPlayers}
            notify={notify}
            isDemo={isDemo}
          />
        )}

        {tab === 'history' && (
          <HistoryView
            history={history}
            statsHistory={squadHistory}
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
            // במצב דוגמה הגבייה חיה בזיכרון, כמו כל השאר, ולא נוגעת בגבייה האמיתית
            payments={isDemo ? demoPayments : settings.payments}
            onChange={isDemo ? setDemoPayments : setRealPayments}
            notify={notify}
          />
        )}

        {tab === 'analysis' && <AnalysisView players={players} history={squadHistory} />}
      </main>

      {ratingCheck && (
        <RatingCheckPopup
          changes={ratingCheck.changes}
          onUndo={undoRatingCheck}
          onClose={() => setRatingCheck(null)}
        />
      )}

      {replaySummary && !ratingCheck && (
        <RatingCheckPopup
          title="תיקון הדירוגים — על כל ההיסטוריה"
          changes={replaySummary}
          onClose={() => setReplaySummary(null)}
        />
      )}

      {squad && !isOwner && (
        <ConfirmDialog
          open={confirmLeave}
          title="יציאה מהקבוצה"
          confirmLabel="יציאה"
          message={
            <>
              להפסיק לעזור בקבוצה של <span dir="ltr">{squad.label}</span>? כדי לחזור צריך הזמנה חדשה.
            </>
          }
          onCancel={() => setConfirmLeave(false)}
          onConfirm={async () => {
            setConfirmLeave(false);
            const err = auth.userId ? await answerInvitation(squad.ownerId, auth.userId, false) : null;
            if (err) notify(`⚠️ ${err}`);
            else onLeftSquad();
          }}
        />
      )}

      {/* מחוץ למצב דוגמה: תמונה ששותפה לאפליקציה שייכת לשחקן אמיתי */}
      {!isDemo && (
        <SharedPhotoModal
          players={players}
          canEdit={isOwner}
          onAssign={setPlayerPhoto}
          notify={notify}
        />
      )}

      <Toast message={toast} />
    </div>
    </FullPhotoContext.Provider>
  );
}
