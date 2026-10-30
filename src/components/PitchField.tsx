import type { HTMLAttributes, ReactNode } from 'react';
import { Avatar } from './ui';

/**
 * חצי מגרש עם סימונים ותווית המערך — הרקע של תצוגת המגרש בעריכה ובשיתוף,
 * כדי ששתיהן ייראו אותו דבר.
 */
export function PitchField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="relative min-h-[9rem] flex-1 overflow-hidden bg-gradient-to-b from-emerald-900/45 to-emerald-950/70 px-2 pt-4 pb-3">
      {/* סימוני חצי מגרש: קו האמצע וחצי העיגול למעלה, הרחבה למטה */}
      <div aria-hidden className="pointer-events-none absolute inset-x-2 inset-y-1.5 rounded-md border border-white/10" />
      <div aria-hidden className="pointer-events-none absolute top-1.5 left-1/2 h-7 w-16 -translate-x-1/2 rounded-b-full border border-t-0 border-white/10" />
      <div aria-hidden className="pointer-events-none absolute bottom-1.5 left-1/2 h-12 w-2/5 -translate-x-1/2 border border-b-0 border-white/10" />

      <span className="absolute top-2 right-3 inline-flex items-center gap-1 rounded-md bg-black/30 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-200">
        מערך
        <span className="font-mono font-bold tabular-nums" dir="ltr">
          {label}
        </span>
      </span>

      <div className="relative flex h-full flex-col justify-between gap-2.5">{children}</div>
    </div>
  );
}

/**
 * שחקן על המגרש: עיגול ושם מתחתיו. מה שבא מתחת לשם (דירוג, תווית עמדה) מגיע
 * מבחוץ — בשיתוף אין שם כלום.
 */
export function PitchPlayer({
  name,
  photo,
  ringed = false,
  className = '',
  children,
  ...rest
}: {
  name: string;
  photo?: string;
  /** טבעת כתומה — משחק לא בעמדה שלו */
  ringed?: boolean;
  className?: string;
  children?: ReactNode;
} & Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'children'>) {
  return (
    <div
      {...rest}
      className={`flex w-[4.75rem] flex-col items-center gap-0.5 rounded-lg px-0.5 py-1 ${className}`}
    >
      <span className={`rounded-full ${ringed ? 'ring-2 ring-amber-400' : ''}`}>
        <Avatar name={name} photo={photo} size={34} />
      </span>
      <span className="w-full truncate text-center text-[11px] leading-tight font-semibold text-slate-100">
        {name}
      </span>
      {children}
    </div>
  );
}

/** השער כשאין בקבוצה שחקן שמסומן כשוער — אף אחד לא מוצג שם */
export function RotatingGoal() {
  return (
    <div className="flex justify-center">
      <span
        className="rounded-lg border border-dashed border-white/20 bg-black/20 px-3 py-2 text-[11px] font-semibold text-slate-300"
        title="אין בקבוצה שחקן שמסומן כשוער, אז אף אחד לא מוצג בשער"
      >
        🧤 מתחלפים בשער
      </span>
    </div>
  );
}
