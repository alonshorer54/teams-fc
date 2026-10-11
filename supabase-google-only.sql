-- ============================================================
--  Teams FC — owner access through Google only
--  Run ONLY together with the Google sign-in version of the app (after supabase-sharing.sql).
--  Before that, the live app still signs in with a password and would lose access.
--
--  Replaces the owner's four policies on kohot_data with the same rules plus
--  kohot_google_session(): the session must come from Google, and the user must have
--  exactly one Google identity (see supabase-sharing.sql for why).
-- ============================================================

drop policy if exists "read own data"   on public.kohot_data;
drop policy if exists "insert own data" on public.kohot_data;
drop policy if exists "update own data" on public.kohot_data;
drop policy if exists "delete own data" on public.kohot_data;

create policy "read own data"
  on public.kohot_data for select to authenticated
  using (public.kohot_google_session() and auth.uid() = user_id);

create policy "insert own data"
  on public.kohot_data for insert to authenticated
  with check (public.kohot_google_session() and auth.uid() = user_id);

create policy "update own data"
  on public.kohot_data for update to authenticated
  using (public.kohot_google_session() and auth.uid() = user_id)
  with check (public.kohot_google_session() and auth.uid() = user_id);

create policy "delete own data"
  on public.kohot_data for delete to authenticated
  using (public.kohot_google_session() and auth.uid() = user_id);
