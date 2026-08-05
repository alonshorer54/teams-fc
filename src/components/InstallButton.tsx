import { useState } from 'react';
import { Download, Share, SquarePlus } from 'lucide-react';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import { Modal } from './ui';

/**
 * כפתור "התקנה כאפליקציה".
 * מוסתר לגמרי אם האפליקציה כבר מותקנת או אם הדפדפן לא תומך בהתקנה.
 */
export function InstallButton({ notify }: { notify: (msg: string) => void }) {
  const { installed, canInstall, needsManualSteps, install } = useInstallPrompt();
  const [showIosSteps, setShowIosSteps] = useState(false);

  if (installed || (!canInstall && !needsManualSteps)) return null;

  return (
    <>
      <button
        className="btn-ghost text-xs"
        onClick={async () => {
          if (canInstall) {
            const ok = await install();
            if (ok) notify('האפליקציה הותקנה 📲');
          } else {
            setShowIosSteps(true);
          }
        }}
      >
        <Download size={14} />
        התקנה כאפליקציה
      </button>

      <Modal
        open={showIosSteps}
        onClose={() => setShowIosSteps(false)}
        title="התקנה על האייפון"
        icon={<SquarePlus size={20} className="text-emerald-400" />}
        maxWidth="max-w-sm"
      >
        <ol className="space-y-3 text-sm leading-relaxed text-slate-300">
          <li className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-xs font-bold text-emerald-300">
              1
            </span>
            <span>
              לחצו על כפתור השיתוף
              <Share size={14} className="mx-1 inline text-sky-400" />
              בתחתית הדפדפן
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-xs font-bold text-emerald-300">
              2
            </span>
            <span>
              גללו ובחרו <b className="text-slate-100">"הוספה למסך הבית"</b>
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-xs font-bold text-emerald-300">
              3
            </span>
            <span>
              לחצו <b className="text-slate-100">"הוסף"</b> — והאפליקציה תופיע עם אייקון משלה
            </span>
          </li>
        </ol>
        <p className="mt-4 rounded-lg bg-slate-950/60 px-3 py-2 text-[11px] leading-relaxed text-slate-400">
          חשוב: זה עובד רק מדפדפן Safari. אם פתחתם מכרום או מוואטסאפ, העתיקו את הכתובת ופתחו אותה
          ב-Safari.
        </p>
        <button className="btn-primary mt-4 w-full" onClick={() => setShowIosSteps(false)}>
          הבנתי
        </button>
      </Modal>
    </>
  );
}
