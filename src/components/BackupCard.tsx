import { useRef, useState } from 'react';
import { Download, HardDriveDownload, Upload } from 'lucide-react';
import type { MatchRecord, Player } from '../types';
import { downloadBackup, parseBackup } from '../lib/storage';
import { ConfirmDialog } from './ui';

/**
 * גיבוי ידני: ייצוא כל הנתונים לקובץ JSON וייבוא חזרה.
 * מאפשר להעביר את המאגר בין מכשירים (מחשב ↔ טלפון) ולשחזר אחרי ניקוי דפדפן.
 */
export function BackupCard({
  players,
  history,
  onImport,
  notify,
}: {
  players: Player[];
  history: MatchRecord[];
  onImport: (players: Player[], history: MatchRecord[]) => void;
  notify: (msg: string) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ players: Player[]; history: MatchRecord[] } | null>(null);

  const handleFile = async (file: File) => {
    try {
      const backup = parseBackup(await file.text());
      setPending({ players: backup.players, history: backup.history });
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
            <h3 className="text-sm font-bold text-slate-100">גיבוי והעברה בין מכשירים</h3>
            <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">
              הנתונים שמורים בדפדפן הזה בלבד. ייצאו קובץ כדי לשחזר אותם או לפתוח אותם במכשיר אחר.
            </p>
          </div>
        </div>

        <div className="flex shrink-0 gap-2">
          <button
            className="btn-ghost !py-2 text-xs"
            onClick={() => {
              downloadBackup(players, history);
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
            <b className="text-slate-100">{pending?.history.length} הגרלות</b>.
            <br />
            הייבוא <b className="text-rose-300">יחליף</b> את כל הנתונים הקיימים בדפדפן הזה. להמשיך?
          </>
        }
        confirmLabel="ייבוא והחלפה"
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending) {
            onImport(pending.players, pending.history);
            notify('הנתונים יובאו בהצלחה ✔');
          }
          setPending(null);
        }}
      />
    </>
  );
}
