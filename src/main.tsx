import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

// רישום ה-service worker — בלעדיו הדפדפן לא מציע להתקין את האפליקציה.
// בפיתוח מדלגים, כדי שלא ישרת קבצים מהמטמון תוך כדי עבודה.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  // אפליקציה שנשארת פתוחה ברקע בטלפון ממשיכה להריץ את הקוד הישן בלי הגבלת
  // זמן — ומכשיר עם גרסה ישנה כותב לענן הגדרות בלי שדות שנוספו מאז, ומוחק
  // אותם אצל כולם. לכן בכל חזרה למסך בודקים אם יש גרסה, והיא נטענת מיד.
  // בהתקנה ראשונה אין גרסה קודמת להחליף, ואין סיבה לרענן — אבל מההחלפה
  // הבאה והלאה כבר כן, גם אם הדף הזה נשאר פתוח מאז.
  let hadController = !!navigator.serviceWorker.controller
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) window.location.reload()
    hadController = true
  })

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .then((registration) => {
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') registration.update().catch(() => {})
        })
      })
      .catch((err) => console.error('רישום ה-service worker נכשל', err))
  })
}
