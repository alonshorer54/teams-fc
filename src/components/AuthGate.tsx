import { useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  CloudOff,
  KeyRound,
  ListOrdered,
  LogIn,
  MailCheck,
  Share2,
  Shuffle,
  Smartphone,
  UserPlus,
  Wallet,
} from 'lucide-react';
import { InstallButton } from './InstallButton';

type Screen = 'intro' | 'signin' | 'signup' | 'forgot';

const FEATURES = [
  {
    icon: Shuffle,
    title: 'כוחות מאוזנים בלחיצה',
    text: 'מחלק את השחקנים לשלוש קבוצות שקולות לפי דירוג, חברויות והעדפות אישיות.',
  },
  {
    icon: ListOrdered,
    title: 'אתם קובעים מה חשוב',
    text: 'סדר עדיפויות שאפשר לשנות: דירוג, חברויות, כימיה משחקית, העדפות אישיות ותגיות.',
  },
  {
    icon: Share2,
    title: 'שיתוף ישיר לוואטסאפ',
    text: 'שולח תמונה מוכנה של הכוחות, או טקסט נקי בלי דירוגים — בלי לצלם מסך.',
  },
  {
    icon: BarChart3,
    title: 'לומד מהתוצאות',
    text: 'עוקב מי מנצח ומי מפסיד, מי נעלם, ואילו צירופי שחקנים באמת עובדים.',
  },
  {
    icon: Wallet,
    title: 'גבייה שבועית',
    text: 'מי שילם ומי לא, בביט או במזומן, עם תזכורת מוכנה לשליחה.',
  },
  {
    icon: Smartphone,
    title: 'בטלפון ובמחשב',
    text: 'מתקינים כאפליקציה, והכול מסתנכרן אוטומטית בין המכשירים.',
  },
];

/**
 * מסך הפתיחה של האפליקציה: הסבר קצר למי שנכנס בפעם הראשונה,
 * ומשם הרשמה, התחברות או שחזור סיסמה.
 */
export function AuthGate({
  onSignIn,
  onSignUp,
  onForgotPassword,
  notify,
}: {
  onSignIn: (email: string, password: string) => Promise<string | null>;
  onSignUp: (email: string, password: string) => Promise<string | null>;
  onForgotPassword: (email: string) => Promise<string | null>;
  notify: (msg: string) => void;
}) {
  const [screen, setScreen] = useState<Screen>('intro');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reset = (next: Screen) => {
    setScreen(next);
    setError(null);
    setNotice(null);
  };

  const submit = async () => {
    if (!email.trim()) {
      setError('צריך למלא אימייל');
      return;
    }
    if (screen !== 'forgot' && !password) {
      setError('צריך למלא סיסמה');
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    const err =
      screen === 'signin'
        ? await onSignIn(email.trim(), password)
        : screen === 'signup'
          ? await onSignUp(email.trim(), password)
          : await onForgotPassword(email.trim());

    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    if (screen === 'signup') {
      setNotice('החשבון נוצר. אם נדרש אישור אימייל — בדקו את תיבת הדואר ואז התחברו.');
      setScreen('signin');
    } else if (screen === 'forgot') {
      setNotice('אם הכתובת רשומה אצלנו, נשלח אליה קישור לאיפוס הסיסמה. בדקו גם בספאם.');
    }
  };

  /* ------------------------------ מסך פתיחה ------------------------------ */

  if (screen === 'intro') {
    return (
      <div className="mx-auto min-h-screen max-w-4xl px-4 py-10 sm:px-6">
        <header className="text-center">
          <div className="mx-auto mb-4 w-fit rounded-3xl bg-emerald-500/15 p-4 text-4xl leading-none">
            ⚽
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-50 sm:text-4xl">
            Teams FC
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-400 sm:text-base">
            מחלקים כוחות לכדורגל השבועי בלי ויכוחים. בוחרים מי משחק, לוחצים על הגרלה, ומקבלים שלוש
            קבוצות מאוזנות — מוכנות לשליחה לקבוצה.
          </p>

          <div className="mt-7 flex flex-wrap justify-center gap-2">
            <button className="btn-primary px-6" onClick={() => reset('signup')}>
              <UserPlus size={16} />
              יצירת חשבון
            </button>
            <button className="btn-ghost px-6" onClick={() => reset('signin')}>
              <LogIn size={16} />
              כבר יש לי חשבון
            </button>
          </div>

          <div className="mt-4 flex justify-center">
            <InstallButton notify={notify} />
          </div>
        </header>

        <ul className="mt-10 grid gap-3 sm:grid-cols-2">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <li key={title} className="card flex items-start gap-3 p-4">
              <span className="rounded-xl bg-slate-800/70 p-2 text-emerald-400">
                <Icon size={18} />
              </span>
              <span>
                <span className="block text-sm font-bold text-slate-100">{title}</span>
                <span className="mt-0.5 block text-[12px] leading-relaxed text-slate-400">
                  {text}
                </span>
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-8 text-center text-[11px] leading-relaxed text-slate-500">
          הנתונים שלכם פרטיים לחשבון שלכם בלבד ומסתנכרנים בין המכשירים.
        </p>
      </div>
    );
  }

  /* --------------------------- טפסי התחברות --------------------------- */

  const titles: Record<Exclude<Screen, 'intro'>, string> = {
    signin: 'התחברות',
    signup: 'יצירת חשבון',
    forgot: 'שחזור סיסמה',
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="card w-full max-w-md p-7">
        <button
          className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 transition hover:text-slate-200"
          onClick={() => reset('intro')}
        >
          <ArrowRight size={13} />
          חזרה
        </button>

        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 w-fit rounded-2xl bg-emerald-500/15 p-3 text-3xl leading-none">
            ⚽
          </div>
          <h1 className="text-2xl font-extrabold text-slate-50">{titles[screen]}</h1>
          <p className="mt-1 text-xs text-slate-400">
            {screen === 'forgot'
              ? 'נשלח אליכם קישור לקביעת סיסמה חדשה'
              : 'אותו חשבון בטלפון ובמחשב — אותם נתונים'}
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="auth-email">
              אימייל
            </label>
            <input
              id="auth-email"
              type="email"
              dir="ltr"
              autoComplete="email"
              className="input text-left"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </div>

          {screen !== 'forgot' && (
            <div>
              <label className="label" htmlFor="auth-password">
                סיסמה
              </label>
              <input
                id="auth-password"
                type="password"
                dir="ltr"
                autoComplete={screen === 'signin' ? 'current-password' : 'new-password'}
                className="input text-left"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
              />
              {screen === 'signup' && (
                <p className="mt-1.5 text-[11px] text-slate-500">לפחות 6 תווים.</p>
              )}
            </div>
          )}

          {error && (
            <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-300">
              {error}
            </p>
          )}
          {notice && (
            <p className="flex items-start gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs leading-relaxed font-semibold text-emerald-300">
              <MailCheck size={14} className="mt-0.5 shrink-0" />
              {notice}
            </p>
          )}

          <button className="btn-primary w-full" onClick={submit} disabled={busy}>
            {screen === 'signin' ? (
              <LogIn size={16} />
            ) : screen === 'signup' ? (
              <UserPlus size={16} />
            ) : (
              <KeyRound size={16} />
            )}
            {busy ? 'רגע...' : screen === 'forgot' ? 'שליחת קישור' : titles[screen]}
          </button>
        </div>

        <div className="mt-5 flex flex-wrap justify-center gap-x-4 gap-y-2 border-t border-slate-800 pt-4 text-[11px] font-semibold">
          {screen !== 'signin' && (
            <button className="text-slate-400 hover:text-slate-200" onClick={() => reset('signin')}>
              יש לי כבר חשבון
            </button>
          )}
          {screen !== 'signup' && (
            <button className="text-slate-400 hover:text-slate-200" onClick={() => reset('signup')}>
              יצירת חשבון חדש
            </button>
          )}
          {screen !== 'forgot' && (
            <button className="text-slate-400 hover:text-slate-200" onClick={() => reset('forgot')}>
              שכחתי סיסמה
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------ קביעת סיסמה חדשה ------------------------ */

export function PasswordRecovery({
  onSubmit,
  onCancel,
}: {
  onSubmit: (password: string) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (password.length < 6) {
      setError('הסיסמה חייבת להכיל לפחות 6 תווים');
      return;
    }
    if (password !== confirm) {
      setError('שתי הסיסמאות אינן זהות');
      return;
    }
    setBusy(true);
    const err = await onSubmit(password);
    setBusy(false);
    if (err) setError(err);
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-md p-7">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 w-fit rounded-2xl bg-emerald-500/15 p-3 text-emerald-400">
            <KeyRound size={26} />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-50">סיסמה חדשה</h1>
          <p className="mt-1 text-xs text-slate-400">בחרו סיסמה חדשה לחשבון</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="new-pass">
              סיסמה חדשה
            </label>
            <input
              id="new-pass"
              type="password"
              dir="ltr"
              autoComplete="new-password"
              className="input text-left"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="new-pass2">
              שוב, לאימות
            </label>
            <input
              id="new-pass2"
              type="password"
              dir="ltr"
              autoComplete="new-password"
              className="input text-left"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </div>

          {error && (
            <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-300">
              {error}
            </p>
          )}

          <button className="btn-primary w-full" onClick={submit} disabled={busy}>
            {busy ? 'שומר...' : 'שמירת הסיסמה'}
          </button>
          <button
            className="w-full text-center text-[11px] font-semibold text-slate-500 hover:text-slate-300"
            onClick={onCancel}
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}

/** מוצג כשאין הגדרות ענן כלל — הסבר קצר במקום מסך התחברות שבור. */
export function CloudNotConfigured() {
  return (
    <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-200">
      <CloudOff size={15} className="mt-0.5 shrink-0" />
      <span>
        <b>מצב מקומי:</b> הנתונים נשמרים בדפדפן הזה בלבד ולא מסתנכרנים לטלפון. כדי להפעיל סנכרון, מלאו
        את <code className="rounded bg-black/30 px-1">.env.local</code> לפי ההוראות ב־README.
      </span>
    </div>
  );
}
