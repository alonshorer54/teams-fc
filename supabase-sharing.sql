-- ============================================================
--  Teams FC — helpers (sharing a squad with someone, by Gmail)
--  Paste the whole file into the Supabase SQL Editor and click Run.
--  Safe to run again. Only ADDS access: the owner's existing policies are untouched,
--  so the app keeps working exactly as before until the new version is deployed.
--
--  A helper can run draws, record results and payments, and add new players — but can't
--  change or remove an existing player. That last rule is enforced here, in the database,
--  by the trigger at the bottom, not just hidden in the app.
-- ============================================================

-- True when the session was signed in through Google AND the user has exactly one Google
-- identity. "Confirm email" is off in this project, so a password sign-up can be opened on
-- someone else's address and later auto-linked to their Google sign-in; one Google identity
-- per user is what keeps an attacker from linking their own Google account in as well.
-- Same rule as cg_google_session() in Class Groups, which shares this project.
create or replace function public.kohot_google_session()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
      select 1
      from pg_catalog.jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) as m
      where m ->> 'method' = 'oauth'
    )
    and (
      select count(*) from auth.identities i
      where i.user_id = auth.uid() and i.provider = 'google'
    ) = 1
$$;

revoke all on function public.kohot_google_session() from public, anon;
grant execute on function public.kohot_google_session() to authenticated;

-- ---------- Tables ----------

-- Helpers who have signed in. owner_email is shown in the helper's squad switcher.
create table if not exists public.kohot_members (
  owner_id    uuid not null references auth.users (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  email       text not null,
  owner_email text not null default '',
  created_at  timestamptz not null default now(),
  primary key (owner_id, user_id),
  check (owner_id <> user_id)
);

-- Pending invites by Gmail address; turned into kohot_members by kohot_claim_invites().
create table if not exists public.kohot_invites (
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  email      text not null check (email = lower(email) and email like '%_@_%'),
  created_at timestamptz not null default now(),
  primary key (owner_id, email)
);

-- An invite becomes a membership only once the invited person accepts it in the app;
-- until then it grants nothing. Without this anyone could make any Gmail a "helper" of
-- their squad, and that squad would open by default on the victim's next sign-in.
alter table public.kohot_members add column if not exists accepted boolean not null default false;

create index if not exists kohot_members_user on public.kohot_members (user_id);
create index if not exists kohot_invites_email on public.kohot_invites (email);

-- ---------- Helpers ----------

-- Whether the signed-in user helps the squad of `owner`.
create or replace function public.kohot_is_helper(owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.kohot_google_session()
    and exists (
      select 1 from public.kohot_members m
      where m.owner_id = owner and m.user_id = auth.uid() and m.accepted
    )
$$;

revoke all on function public.kohot_is_helper(uuid) from public, anon;
grant execute on function public.kohot_is_helper(uuid) to authenticated;

-- Turns the signed-in user's pending invites into memberships. Called after every sign-in.
-- The address comes from the Google identity, which Google has verified.
create or replace function public.kohot_claim_invites()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_count integer;
begin
  if not public.kohot_google_session() then
    return 0;
  end if;

  select lower(i.identity_data ->> 'email') into v_email
  from auth.identities i
  where i.user_id = auth.uid() and i.provider = 'google'
  limit 1;

  if v_email is null then
    return 0;
  end if;

  insert into public.kohot_members (owner_id, user_id, email, owner_email)
  select inv.owner_id, auth.uid(), v_email, coalesce(u.email, '')
  from public.kohot_invites inv
  join auth.users u on u.id = inv.owner_id
  where inv.email = v_email and inv.owner_id <> auth.uid()
  on conflict (owner_id, user_id) do nothing;
  get diagnostics v_count = row_count;

  delete from public.kohot_invites where email = v_email;
  return v_count;
end
$$;

revoke all on function public.kohot_claim_invites() from public, anon;
grant execute on function public.kohot_claim_invites() to authenticated;

-- ---------- Row level security ----------

alter table public.kohot_members enable row level security;
alter table public.kohot_invites enable row level security;

-- Members: the owner sees and removes their helpers; a helper sees and can leave.
-- Rows are only ever added by kohot_claim_invites().
drop policy if exists "kohot read members"   on public.kohot_members;
drop policy if exists "kohot remove members" on public.kohot_members;
drop policy if exists "kohot accept invite"  on public.kohot_members;
create policy "kohot read members" on public.kohot_members for select to authenticated
  using (public.kohot_google_session() and (owner_id = auth.uid() or user_id = auth.uid()));
create policy "kohot remove members" on public.kohot_members for delete to authenticated
  using (public.kohot_google_session() and (owner_id = auth.uid() or user_id = auth.uid()));
-- The invited person accepts (or un-accepts) their own membership — and only that column
create policy "kohot accept invite" on public.kohot_members for update to authenticated
  using (public.kohot_google_session() and user_id = auth.uid())
  with check (public.kohot_google_session() and user_id = auth.uid());
revoke update on public.kohot_members from anon, authenticated;
grant update (accepted) on public.kohot_members to authenticated;

-- Invites: the owner only.
drop policy if exists "kohot owner invites" on public.kohot_invites;
create policy "kohot owner invites" on public.kohot_invites for all to authenticated
  using (public.kohot_google_session() and owner_id = auth.uid())
  with check (public.kohot_google_session() and owner_id = auth.uid());

-- The squad itself: helpers may read and update the owner's row (never insert or delete).
-- These sit next to the owner's existing policies; Postgres allows a row when any applies.
drop policy if exists "helpers read team"   on public.kohot_data;
drop policy if exists "helpers update team" on public.kohot_data;
create policy "helpers read team" on public.kohot_data for select to authenticated
  using (public.kohot_is_helper(user_id));
create policy "helpers update team" on public.kohot_data for update to authenticated
  using (public.kohot_is_helper(user_id))
  with check (public.kohot_is_helper(user_id));

-- ---------- What a helper may change ----------

-- On a helper's write: every existing player must still be there, unchanged — except the
-- rating, by at most one automatic correction step (0.1) for a recorded result or its undo.
-- New players may be added with any rating. The owner is not limited.
create or replace function public.kohot_guard_helper_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
begin
  -- The owner, and server-side roles that carry no user at all
  if auth.uid() is null or auth.uid() = old.user_id then
    return new;
  end if;

  if new.user_id is distinct from old.user_id then
    raise exception 'helpers cannot move a squad' using errcode = '42501';
  end if;

  -- The anchor that makes the owner's app recompute every rating from the whole history.
  -- If a helper could reset it, the owner's own device would replay whatever corrections
  -- the helper wrote into history — and save the result with the owner's rights.
  if (new.settings -> 'ratingDriftSince') is distinct from (old.settings -> 'ratingDriftSince') then
    raise exception 'helpers cannot change how ratings are recomputed' using errcode = '42501';
  end if;

  -- A recorded correction is always one step. A bigger one in history would let the owner's
  -- "undo result" move a rating by however much the helper wrote.
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(new.history) as r,
         pg_catalog.jsonb_array_elements(coalesce(r -> 'ratingCheck' -> 'changes', '[]'::jsonb)) as c
    where abs((c ->> 'to')::numeric - (c ->> 'from')::numeric) > 0.1001
  ) then
    raise exception 'helpers cannot edit existing players (correction too large)' using errcode = '42501';
  end if;

  -- A second entry with an existing id would pass the per-player check below on the
  -- untouched original, and smuggle in an edited copy
  if (select count(*) from pg_catalog.jsonb_array_elements(new.players))
     <> (select count(distinct value ->> 'id') from pg_catalog.jsonb_array_elements(new.players)) then
    raise exception 'helpers cannot edit existing players (duplicate id)' using errcode = '42501';
  end if;

  for v_old in select value from pg_catalog.jsonb_array_elements(old.players) loop
    select value into v_new
    from pg_catalog.jsonb_array_elements(new.players)
    where value ->> 'id' = v_old ->> 'id'
    limit 1;

    if v_new is null then
      raise exception 'helpers cannot remove players' using errcode = '42501';
    end if;
    if (v_new - 'rating') <> (v_old - 'rating')
       or abs(coalesce((v_new ->> 'rating')::numeric, 0) - coalesce((v_old ->> 'rating')::numeric, 0)) > 0.1001 then
      raise exception 'helpers cannot edit existing players' using errcode = '42501';
    end if;
  end loop;

  return new;
end
$$;

drop trigger if exists kohot_guard_helper_write on public.kohot_data;
create trigger kohot_guard_helper_write
  before update on public.kohot_data
  for each row execute function public.kohot_guard_helper_write();
