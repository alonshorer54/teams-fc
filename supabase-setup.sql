-- ============================================================
--  כוחות — הקמת מסד הנתונים ב-Supabase
--  הדביקו את כל הקובץ ב-SQL Editor של הפרויקט ולחצו Run.
-- ============================================================

-- טבלה אחת שמחזיקה "מסמך" נתונים לכל משתמש
create table if not exists public.kohot_data (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  players    jsonb       not null default '[]'::jsonb,
  history    jsonb       not null default '[]'::jsonb,
  settings   jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- לטבלאות שנוצרו לפני שעמודת ההגדרות התווספה
alter table public.kohot_data
  add column if not exists settings jsonb not null default '{}'::jsonb;

-- הפעלת אבטחת שורות: כל משתמש רואה ומעדכן אך ורק את הנתונים שלו
alter table public.kohot_data enable row level security;

-- The policies are created only when missing. supabase-google-only.sql later replaces them
-- with stricter ones of the same names; running this file again used to drop those and put
-- back the old, weaker rules without a word. Now a second run leaves them as they are.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'kohot_data' and policyname = 'read own data') then
    create policy "read own data"
      on public.kohot_data for select
      using (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'kohot_data' and policyname = 'insert own data') then
    create policy "insert own data"
      on public.kohot_data for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'kohot_data' and policyname = 'update own data') then
    create policy "update own data"
      on public.kohot_data for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'kohot_data' and policyname = 'delete own data') then
    create policy "delete own data"
      on public.kohot_data for delete
      using (auth.uid() = user_id);
  end if;

  -- סנכרון בזמן אמת בין המחשב לטלפון (once: adding the table a second time is an error)
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'kohot_data'
  ) then
    alter publication supabase_realtime add table public.kohot_data;
  end if;
end
$$;

-- שורות מלאות באירועי Realtime (נדרש כדי לקבל את התוכן המעודכן)
alter table public.kohot_data replica identity full;
