import { createContext } from 'react';

/**
 * טוען את התמונה המלאה של שחקן לפי המזהה שלו. האפליקציה מספקת אותו (היא יודעת
 * של איזה מאגר מדובר); בלעדיו ההגדלה מציגה את העיגול עצמו.
 */
export const FullPhotoContext = createContext<
  ((playerId: string, small: string | undefined) => Promise<string | null>) | null
>(null);
