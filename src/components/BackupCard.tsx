import { useRef, useState } from 'react';
import { Download, HardDriveDownload, Upload } from 'lucide-react';
import type { MatchRecord, Player } from '../types';
import { downloadBackup, parseBackup, type AppSettings, type BackupFile } from '../lib/storage';
import { ConfirmDialog } from './ui';

/**
 * גיבוי ידני: ייצוא כל הנתונים לקובץ JSON וייבוא חזרה.
 * The squad lives in the cloud; the file is an extra copy in your own hands — to restore a
 * mistake, or to keep a record outside the app.
 */
export function BackupCard({
  players,
  history,
  settings,
  onImport,
  notify,
}: {
  players: Player[];
  history: MatchRecord[];
  settings: AppSettings;
  /** Resolves to whether the cloud took the import */
  onImport: (backup: BackupFile) => Promise<boolean>;
  notify: (msg: string) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<BackupFile | null>(null);
  const [importing, setImporting] = useState(false);

  const handleFile = async (file: File) => {
    try {
      setPending(parseBackup(await file.text()));
    } catch (err) {
      notify(err instanceof Error ? err.message : 'קריאת הקובץ נכשלה');
    }
  };

  return (
    <>
      <section className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <HardDriveDownload size={18} className="mt-0.5 shrink-0 text-slate-400" />
          <div>
            <h3 className="text-sm font-bold text-slate-100">קובץ גיבוי</h3>
            <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">
              הנתונים נשמרים בענן ומסתנכרנים בין המכשירים. קובץ גיבוי הוא עותק נוסף אצלך — שחקנים,
              היסטוריה ותשלומים — לשחזור במקרה של טעות.
            </p>
          </div>
        </div>

        <div className="flex shrink-0 gap-2">
          <button
            className="btn-ghost !py-2 text-xs"
            onClick={() => {
              downloadBackup(players, history, settings);
              notify('קובץ הגיבוי ירד');
            }}
            disabled={!players.length}
          >
            <Download size={14} />
            ייצוא גיבוי
          </button>

          <button className="btn-ghost !py-2 text-xs" onClick={() => fileInput.current?.click()}>
            <Upload size={14} />
            ייבוא גיבוי
          </button>

          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = ''; // מאפשר לבחור שוב את אותו קובץ
            }}
          />
        </div>
      </section>

      <ConfirmDialog
        open={!!pending}
        title="ייבוא גיבוי"
        message={
          <>
            הקובץ מכיל <b className="text-slate-100">{pending?.players.length} שחקנים</b> ו־
            <b className="text-slate-100">{pending?.history.length} הגרלות</b>
            {pending?.settings?.payments && ' ואת התשלומים'}.
            <br />
            הייבוא <b className="text-rose-300">יחליף</b> את כל הנתונים של הקבוצה, בכל המכשירים. להמשיך?
          </>
        }
        confirmLabel={importing ? 'מייבא...' : 'ייבוא והחלפה'}
        onCancel={() => setPending(null)}
        onConfirm={async () => {
          if (!pending || importing) return;
          setImporting(true);
          const saved = await onImport(pending);
          setImporting(false);
          setPending(null);
          // Only claim success once the cloud has it; otherwise it's on this device, still trying
          notify(
            saved
              ? 'הנתונים יובאו בהצלחה ✔'
              : '⚠️ הנתונים יובאו למכשיר הזה, אבל עוד לא נשמרו בענן — ננסה שוב אוטומטית',
          );
        }}
      />
    </>
  );
}
