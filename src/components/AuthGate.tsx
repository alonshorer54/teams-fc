import { useState } from 'react';
import {
  BarChart3,
  CloudOff,
  FlaskConical,
  ListOrdered,
  Share2,
  Shuffle,
  Smartphone,
  Wallet,
} from 'lucide-react';
import { InstallButton } from './InstallButton';

const FEATURES = [
  {
    icon: Shuffle,
    title: 'קבוצות מאוזנות בלחיצה',
    text: 'מחלק את מי שהגיע ל-2 או 3 קבוצות שקולות, לפי דירוג, חברויות והעדפות אישיות.',
  },
  {
    icon: ListOrdered,
    title: 'אתם קובעים מה חשוב',
    text: 'סדר עדיפויות שאפשר לשנות: דירוג, עמדות, חברויות, כימיה משחקית והעדפות אישיות.',
  },
  {
    icon: Share2,
    title: 'שיתוף ישיר לוואטסאפ',
    text: 'שולח תמונה מוכנה של הקבוצות, או טקסט נקי בלי דירוגים — בלי לצלם מסך.',
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

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/** The opening screen: what the app does, the demo, and Google sign-in. */
export function AuthGate({
  onGoogle,
  onTryDemo,
  notify,
}: {
  onGoogle: () => Promise<string | null>;
  /** Opens the app with sample data, no account, nothing saved */
  onTryDemo: () => void;
  notify: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mx-auto min-h-screen max-w-4xl px-4 py-10 sm:px-6">
      <header className="text-center">
        <div className="mx-auto mb-4 w-fit rounded-3xl bg-emerald-500/15 p-4 text-4xl leading-none">
          ⚽
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-50 sm:text-4xl">Teams FC</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-400 sm:text-base">
          מחלקים קבוצות לכדורגל השבועי בלי ויכוחים. בוחרים מי משחק, לוחצים על הגרלה, ומקבלים
          חלוקה מאוזנת — מוכנה לשליחה לקבוצה.
        </p>

        <div className="mx-auto mt-7 flex max-w-sm flex-col gap-2">
          <button
            className="flex w-full cursor-pointer items-center justify-center gap-3 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow transition hover:bg-slate-100 active:scale-[0.98] disabled:opacity-50"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              const err = await onGoogle();
              // On success the browser is already on its way to Google
              if (err) {
                setError(err);
                setBusy(false);
              }
            }}
          >
            <GoogleMark />
            המשך עם גוגל
          </button>
          <button className="btn-ghost w-full py-3" onClick={onTryDemo}>
            <FlaskConical size={16} />
            מצב דוגמה
          </button>
          {error && (
            <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-300">{error}</p>
          )}
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
              <span className="mt-0.5 block text-[12px] leading-relaxed text-slate-400">{text}</span>
            </span>
          </li>
        ))}
      </ul>
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
