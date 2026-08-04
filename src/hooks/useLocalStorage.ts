import { useEffect, useRef, useState } from 'react';
import { loadJSON, saveJSON } from '../lib/storage';

/** state שנשמר אוטומטית ל-localStorage בכל שינוי. */
export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => loadJSON(key, initial));
  const firstRun = useRef(true);

  useEffect(() => {
    // אין טעם לכתוב מיד את מה שהרגע קראנו
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    saveJSON(key, value);
  }, [key, value]);

  return [value, setValue] as const;
}
