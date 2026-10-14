-- ============================================================
--  Teams FC — full-size player photos
--  Run once in Supabase → SQL Editor, after supabase-sharing.sql and supabase-google-only.sql.
--
--  The small round photo lives inside kohot_data.players, which syncs to every device on
--  every change and must stay well under Realtime's 1MB row limit. The full photo shown
--  when a player's picture is tapped is ~10x bigger, so it lives here instead: one row per
--  player, read only when someone opens it, and deliberately NOT added to supabase_realtime.
-- ============================================================

create table if not exists public.kohot_photos (
  owner_id   uuid not null references auth.users (id) on delete cascade,
  player_id  text not null check (char_length(player_id) between 1 and 64),
  -- Only a JPEG the app produced: no external URL (which would reveal who opened it) and no
  -- SVG (which can carry script). ~300KB covers a 640px JPEG with room to spare.
  photo      text not null check (
    char_length(photo) <= 300000 and photo ~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+=*$'
  ),
  updated_at timestamptz not null default now(),
  primary key (owner_id, player_id)
);

alter table public.kohot_photos enable row level security;

-- The owner manages their squad's photos; helpers may only look at them.
drop policy if exists "kohot photos owner"   on public.kohot_photos;
drop policy if exists "kohot photos helpers" on public.kohot_photos;

create policy "kohot photos owner" on public.kohot_photos for all to authenticated
  using (public.kohot_google_session() and owner_id = auth.uid())
  with check (public.kohot_google_session() and owner_id = auth.uid());

create policy "kohot photos helpers" on public.kohot_photos for select to authenticated
  using (public.kohot_is_helper(owner_id));
