import { useState } from 'react';
import { CloudOff, LogIn, Smartphone, UserPlus } from 'lucide-react';

/**
 * מסך התחברות. מוצג רק כשהענן מוגדר ואין משתמש מחובר.
 * אותו חשבון במחשב ובטלפון = אותם נתונים.
 */
export function AuthGate({
  onSignIn,
  onSignUp,
}: {
  onSignIn: (email: string, password: string) => Promise<string | null>;
  onSignUp: (email: string, password: string) => Promise<string | null>;
}) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async () => {
    if (!email.trim() || !password) {
      setError('צריך למלא אימייל וסיסמה');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);

    const err =
      mode === 'signin'
        ? await onSignIn(email.trim(), password)
        : await onSignUp(email.trim(), password);

    setBusy(false);
    if (err) {
      setError(err);
    } else if (mode === 'signup') {
      setNotice('החשבון נוצר. אם נדרש אישור אימייל — בדקו את תיבת הדואר ואז התחברו.');
      setMode('signin');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-md p-7">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 w-fit rounded-2xl bg-emerald-500/15 p-3 text-3xl leading-none">⚽</div>
          <h1 className="text-2xl font-extrabold text-slate-50">Teams FC</h1>
          <p className="mt-1 text-xs text-slate-400">
            {mode === 'signin' ? 'התחברו כדי לסנכרן בין המחשב לטלפון' : 'יצירת חשבון חדש'}
          </p>
        </div>

        <div className="mb-5 flex rounded-xl border border-slate-700/80 bg-slate-800/40 p-1">
          <button
            className={`flex-1 cursor-pointer rounded-lg px-3 py-2 text-xs font-bold transition ${
              mode === 'signin' ? 'bg-emerald-500 text-emerald-950' : 'text-slate-300 hover:text-white'
            }`}
            onClick={() => {
              setMode('signin');
              setError(null);
            }}
          >
            התחברות
          </button>
          <button
            className={`flex-1 cursor-pointer rounded-lg px-3 py-2 text-xs font-bold transition ${
              mode === 'signup' ? 'bg-emerald-500 text-emerald-950' : 'text-slate-300 hover:text-white'
            }`}
            onClick={() => {
              setMode('signup');
              setError(null);
            }}
          >
            הרשמה
          </button>
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

          <div>
            <label className="label" htmlFor="auth-password">
              סיסמה
            </label>
            <input
              id="auth-password"
              type="password"
              dir="ltr"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              className="input text-left"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
            {mode === 'signup' && (
              <p className="mt-1.5 text-[11px] text-slate-500">לפחות 6 תווים.</p>
            )}
          </div>

          {error && (
            <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-300">{error}</p>
          )}
          {notice && (
            <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300">
              {notice}
            </p>
          )}

          <button className="btn-primary w-full" onClick={submit} disabled={busy}>
            {mode === 'signin' ? <LogIn size={16} /> : <UserPlus size={16} />}
            {busy ? 'רגע...' : mode === 'signin' ? 'התחברות' : 'יצירת חשבון'}
          </button>
        </div>

        <p className="mt-6 flex items-start gap-2 border-t border-slate-800 pt-4 text-[11px] leading-relaxed text-slate-500">
          <Smartphone size={13} className="mt-0.5 shrink-0" />
          התחברו לאותו חשבון בטלפון ובמחשב — השחקנים וההיסטוריה יופיעו בשניהם ויתעדכנו בזמן אמת.
        </p>
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
