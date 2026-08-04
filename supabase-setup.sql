-- ============================================================
--  כוחות — הקמת מסד הנתונים ב-Supabase
--  הדביקו את כל הקובץ ב-SQL Editor של הפרויקט ולחצו Run.
-- ============================================================

-- טבלה אחת שמחזיקה "מסמך" נתונים לכל משתמש
create table if not exists public.kohot_data (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  players    jsonb       not null default '[]'::jsonb,
  history    jsonb       not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- הפעלת אבטחת שורות: כל משתמש רואה ומעדכן אך ורק את הנתונים שלו
alter table public.kohot_data enable row level security;

drop policy if exists "read own data"   on public.kohot_data;
drop policy if exists "insert own data" on public.kohot_data;
drop policy if exists "update own data" on public.kohot_data;
drop policy if exists "delete own data" on public.kohot_data;

create policy "read own data"
  on public.kohot_data for select
  using (auth.uid() = user_id);

create policy "insert own data"
  on public.kohot_data for insert
  with check (auth.uid() = user_id);

create policy "update own data"
  on public.kohot_data for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "delete own data"
  on public.kohot_data for delete
  using (auth.uid() = user_id);

-- סנכרון בזמן אמת בין המחשב לטלפון
alter publication supabase_realtime add table public.kohot_data;

-- שורות מלאות באירועי Realtime (נדרש כדי לקבל את התוכן המעודכן)
alter table public.kohot_data replica identity full;
