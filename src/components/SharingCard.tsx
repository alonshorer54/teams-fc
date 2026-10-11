import { useCallback, useEffect, useState } from 'react';
import { Mail, MessageCircle, Trash2, UserPlus, Users } from 'lucide-react';
import { checkEmail, unlinkedEmail } from '../lib/emails';
import { supabase } from '../lib/supabase';

interface Helper {
  userId: string;
  email: string;
  /** Signed in but hasn't said yes yet */
  accepted: boolean;
}


/**
 * The owner's sharing panel: invite a helper by Gmail, see who helps, remove them.
 * A helper can draw, record results and payments, and add new players from a pasted list;
 * they can't change or remove existing players (enforced in the database).
 */
export function SharingCard({
  ownerId,
  ownerEmail,
  notify,
}: {
  ownerId: string;
  ownerEmail: string | null;
  notify: (msg: string) => void;
}) {
  const [helpers, setHelpers] = useState<Helper[]>([]);
  const [invites, setInvites] = useState<string[]>([]);
  const [email, setEmail] = useState('');
  const [lastInvited, setLastInvited] = useState<string | null>(null);
  /** The address is checked once the field is left or the invite is sent, not mid-typing */
  const [checked, setChecked] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  const load = useCallback(async () => {
    const client = supabase;
    if (!client) return;
    const [m, i] = await Promise.all([
      client.from('kohot_members').select('user_id, email, accepted').eq('owner_id', ownerId).order('email'),
      client.from('kohot_invites').select('email').eq('owner_id', ownerId).order('email'),
    ]);
    if (m.error || i.error) {
      setUnavailable(true);
      return;
    }
    setHelpers(
      (m.data ?? []).map((x: { user_id: string; email: string; accepted: boolean }) => ({
        userId: x.user_id,
        email: x.email,
        accepted: x.accepted,
      })),
    );
    setInvites((i.data ?? []).map((x: { email: string }) => x.email));
  }, [ownerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (action: () => PromiseLike<{ error: { message: string } | null }>, done: string) => {
    const { error } = await action();
    if (error) {
      notify(`⚠️ ${error.message}`);
      return false;
    }
    notify(done);
    await load();
    return true;
  };

  if (!supabase || unavailable) return null;
  const client = supabase;
  const check = checkEmail(email);
  const self = check.ok && check.email === ownerEmail?.toLowerCase();
  const problem = !check.ok ? check.error : self ? 'זו הכתובת שלך' : '';

  return (
    <section className="card p-4 sm:p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-200">
        <Users size={16} className="text-emerald-400" />
        עוזרים
      </h2>

      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setChecked(true);
          if (!check.ok || self) return;
          const to = check.email;
          const ok = await run(
            () => client.from('kohot_invites').upsert({ email: to }),
            'ההזמנה נשמרה',
          );
          if (ok) {
            setLastInvited(to);
            setEmail('');
            setChecked(false);
          }
        }}
      >
        <input
          className="input"
          type="email"
          dir="ltr"
          placeholder="name@gmail.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => email.trim() && setChecked(true)}
        />
        <button className="btn-primary shrink-0" disabled={!email.trim() || (checked && !!problem)}>
          <UserPlus size={15} />
          הזמנה
        </button>
      </form>
      {checked && problem && <p className="mt-2 text-xs font-semibold text-amber-300">{problem}</p>}

      {lastInvited && (
        <a
          className="btn-ghost mt-3 w-full text-xs"
          href={`https://wa.me/?text=${encodeURIComponent(
            `הוזמנת לעזור בניהול הקבוצה ב-Teams FC.\nנכנסים עם חשבון הגוגל ${unlinkedEmail(lastInvited)}:\n${window.location.origin}`,
          )}`}
          target="_blank"
          rel="noreferrer"
        >
          <MessageCircle size={14} />
          לשלוח ל-{lastInvited} הודעה בוואטסאפ
        </a>
      )}

      {helpers.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {helpers.map((h) => (
            <li
              key={h.userId}
              className="flex items-center gap-2 rounded-xl border border-slate-800/80 bg-slate-950/40 px-3 py-2 text-sm"
            >
              <span className="flex-1 truncate text-slate-200" dir="ltr">
                {h.email}
              </span>
              {!h.accepted && <span className="shrink-0 text-[11px] text-amber-300">ממתין לאישור שלו</span>}
              <button
                className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-500/15 hover:text-rose-300"
                title="הסרה"
                onClick={() =>
                  run(() => client.from('kohot_members').delete().eq('owner_id', ownerId).eq('user_id', h.userId), 'העוזר הוסר')
                }
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {invites.length > 0 && (
        <>
          <div className="label mt-4">הוזמנו ועוד לא נכנסו</div>
          <ul className="space-y-1.5">
            {invites.map((addr) => (
              <li key={addr} className="flex items-center gap-2 px-1 text-sm text-slate-400">
                <Mail size={14} className="shrink-0" />
                <span className="flex-1 truncate" dir="ltr">
                  {addr}
                </span>
                <button
                  className="rounded-lg p-1.5 hover:bg-rose-500/15 hover:text-rose-300"
                  title="ביטול ההזמנה"
                  onClick={() =>
                    run(() => client.from('kohot_invites').delete().eq('owner_id', ownerId).eq('email', addr), 'ההזמנה בוטלה')
                  }
                >
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
