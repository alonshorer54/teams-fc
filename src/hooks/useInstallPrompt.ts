import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** האם האפליקציה כבר רצה במצב מותקן (לא בתוך דפדפן) */
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  // iOS מסמן את זה בדרך משלו
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  // אייפד חדש מתחזה למק
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/**
 * מנהל את התקנת האפליקציה למסך הבית.
 *
 * באנדרואיד/כרום הדפדפן נותן לנו אירוע ואפשר לפתוח דיאלוג התקנה אמיתי.
 * ב-iOS אין API כזה — שם רק מסבירים למשתמש מה ללחוץ.
 */
export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault(); // מונע מהדפדפן להציג באנר משלו
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferred) return false;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    return outcome === 'accepted';
  };

  return {
    installed,
    /** אפשר להציג דיאלוג התקנה אמיתי */
    canInstall: !!deferred,
    /** צריך להסביר ידנית — iOS */
    needsManualSteps: !installed && !deferred && isIos(),
    install,
  };
}
