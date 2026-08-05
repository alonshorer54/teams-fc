import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * רשת ביטחון: בלי זה תקלה בודדת ברינדור מוחקת את כל המסך ומשאירה דף לבן.
 * כאן לפחות רואים מה קרה ואפשר להתאושש בלי לאבד נתונים.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('שגיאה לא צפויה:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="card w-full max-w-lg p-6 text-center">
          <div className="mx-auto mb-3 w-fit rounded-2xl bg-rose-500/15 p-3 text-3xl leading-none">
            ⚠️
          </div>
          <h1 className="text-lg font-bold text-slate-100">משהו השתבש</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            הנתונים שלכם בטוחים — הם שמורים בענן ובדפדפן. נסו לרענן את הדף.
          </p>

          <pre
            dir="ltr"
            className="mt-4 max-h-32 overflow-auto rounded-xl bg-slate-950/70 p-3 text-left font-mono text-[11px] text-rose-300"
          >
            {error.message}
          </pre>

          <div className="mt-5 flex gap-2">
            <button className="btn-primary flex-1" onClick={() => window.location.reload()}>
              רענון הדף
            </button>
            <button className="btn-ghost" onClick={() => this.setState({ error: null })}>
              ניסיון חוזר
            </button>
          </div>
        </div>
      </div>
    );
  }
}
