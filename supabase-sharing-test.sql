-- ============================================================
--  Teams FC — helper access test. Paste into the SQL Editor and click Run
--  (choose "Run without RLS" if asked — the only table it creates is a temp table).
--
--  Acts as the owner, an invited helper and a stranger against the owner's squad and
--  reports row by row what each could see or change. Every write attempt is rolled back,
--  so the real squad is not touched. Needs one helper who has signed in (kohot_members).
-- ============================================================

create temp table if not exists kohot_rls_results (
  n int, test text, expected text, got text, detail text, ok text
);
truncate kohot_rls_results;

do $$
declare
  v_owner uuid;
  v_helper uuid;
  v_accepted boolean;
  v_stranger uuid := gen_random_uuid();
  v_uid uuid;
  t record;
  v_got text;
  v_detail text;
  v_count bigint;
begin
  select m.owner_id, m.user_id, m.accepted into v_owner, v_helper, v_accepted
  from public.kohot_members m order by m.created_at limit 1;
  if v_owner is null then
    raise exception 'No helper has signed in yet (kohot_members is empty)';
  end if;

  -- %1$L is the owner's id
  for t in
    select * from (values
      (1,  'owner',    true, 'count', 'select count(*) from public.kohot_data where user_id = %1$L', '1', 'בעלים: רואה את הקבוצה שלו'),
      (2,  'helper',   true, 'count', 'select count(*) from public.kohot_data where user_id = %1$L', '1', 'עוזר: רואה את הקבוצה'),
      (3,  'helper',   true, 'write', 'update public.kohot_data set players = players || ''[{"id":"rls-new","name":"RLS","rating":4.5,"friendIds":[],"loveIds":[],"hateIds":[],"positions":["any"]}]''::jsonb where user_id = %1$L', 'עבר', 'עוזר: מוסיף שחקן חדש (דירוג 4.5)'),
      (4,  'helper',   true, 'write', 'update public.kohot_data set history = ''[{"id":"rls-round"}]''::jsonb || history where user_id = %1$L', 'עבר', 'עוזר: רושם בהיסטוריה'),
      (5,  'helper',   true, 'write', 'update public.kohot_data set players = jsonb_set(players, ''{0,rating}'', to_jsonb(((players->0->>''rating'')::numeric + 0.1))) where user_id = %1$L', 'עבר', 'עוזר: תיקון אוטומטי של 0.1 בדירוג'),
      (6,  'helper',   true, 'write', 'update public.kohot_data set players = jsonb_set(players, ''{0,rating}'', to_jsonb(((players->0->>''rating'')::numeric + 0.5))) where user_id = %1$L', 'חסום', 'עוזר: לא יכול לשנות דירוג של שחקן קיים'),
      (7,  'helper',   true, 'write', 'update public.kohot_data set players = jsonb_set(players, ''{0,name}'', ''"RLS renamed"'') where user_id = %1$L', 'חסום', 'עוזר: לא יכול לשנות שם של שחקן קיים'),
      (8,  'helper',   true, 'write', 'update public.kohot_data set players = jsonb_set(players, ''{0,positions}'', ''["gk"]'') where user_id = %1$L', 'חסום', 'עוזר: לא יכול לשנות עמדה של שחקן קיים'),
      (9,  'helper',   true, 'write', 'update public.kohot_data set players = players - 0 where user_id = %1$L', 'חסום', 'עוזר: לא יכול למחוק שחקן'),
      (10, 'helper',   true, 'write', 'delete from public.kohot_data where user_id = %1$L', 'חסום', 'עוזר: לא יכול למחוק את הקבוצה'),
      (11, 'helper',   true, 'write', 'insert into public.kohot_invites (owner_id, email) values (%1$L, ''rls-test@example.com'')', 'חסום', 'עוזר: לא יכול להזמין אחרים'),
      (12, 'helper',   true, 'count', 'select count(*) from public.kohot_invites where owner_id = %1$L', '0', 'עוזר: לא רואה את ההזמנות של הבעלים'),
      (13, 'stranger', true, 'count', 'select count(*) from public.kohot_data where user_id = %1$L', '0', 'זר: לא רואה את הקבוצה'),
      (14, 'stranger', true, 'write', 'update public.kohot_data set history = history where user_id = %1$L', 'חסום', 'זר: לא יכול לשנות את הקבוצה'),
      (15, 'stranger', true, 'write', 'insert into public.kohot_members (owner_id, user_id, email) values (%1$L, auth.uid(), ''x@example.com'')', 'חסום', 'זר: לא יכול לצרף את עצמו כעוזר'),
      (16, 'stranger', true, 'count', 'select public.kohot_claim_invites()', '0', 'זר: לא תופס הזמנות של אחרים'),
      (17, 'helper',   true, 'write', 'update public.kohot_data set players = players || jsonb_build_array(jsonb_set(players->0, ''{rating}'', ''5'')) where user_id = %1$L', 'חסום', 'עוזר: לא יכול להוסיף "עותק" של שחקן קיים עם דירוג אחר'),
      (18, 'helper',   true, 'write', 'update public.kohot_data set settings = jsonb_set(settings, ''{ratingDriftSince}'', ''""'') where user_id = %1$L', 'חסום', 'עוזר: לא יכול להפעיל חישוב דירוגים מההתחלה'),
      (19, 'helper',   true, 'write', 'update public.kohot_data set history = jsonb_build_array(jsonb_build_object(''id'', ''rls-x'', ''ratingCheck'', jsonb_build_object(''changes'', jsonb_build_array(jsonb_build_object(''playerId'', players->0->>''id'', ''from'', 1, ''to'', 4))))) || history where user_id = %1$L', 'חסום', 'עוזר: לא יכול לרשום תיקון דירוג גדול מ-0.1'),
      (20, 'helper',   true, 'write', 'update public.kohot_data set history = jsonb_build_array(jsonb_build_object(''id'', ''rls-y'', ''ratingCheck'', jsonb_build_object(''changes'', jsonb_build_array(jsonb_build_object(''playerId'', players->0->>''id'', ''from'', 3, ''to'', 3.1))))) || history where user_id = %1$L', 'עבר', 'עוזר: תיקון רגיל של 0.1 נרשם'),
      (21, 'helper',   false, 'count', 'select count(*) from public.kohot_data where user_id = %1$L', '0', 'מוזמן שעוד לא אישר: לא רואה את הקבוצה'),
      (22, 'helper',   false, 'write', 'update public.kohot_members set accepted = true where owner_id = %1$L and user_id = auth.uid()', 'עבר', 'מוזמן: יכול לאשר את ההזמנה של עצמו'),
      (23, 'helper',   true, 'write', 'update public.kohot_members set owner_email = ''x@example.com'' where owner_id = %1$L and user_id = auth.uid()', 'חסום', 'עוזר: לא יכול לשנות פרטים אחרים בחברות שלו')
    ) as v(ord, who, accepted, kind, stmt, expected, label)
    order by ord
  loop
    reset role;
    -- Each case says whether the helper has accepted; the real value is restored at the end
    update public.kohot_members set accepted = t.accepted
    where owner_id = v_owner and user_id = v_helper and accepted <> t.accepted;
    v_uid := case t.who when 'owner' then v_owner when 'helper' then v_helper else v_stranger end;
    perform set_config(
      'request.jwt.claims',
      json_build_object(
        'sub', v_uid,
        'role', 'authenticated',
        'amr', json_build_array(json_build_object('method', 'oauth', 'timestamp', extract(epoch from now())::bigint))
      )::text,
      true
    );
    perform set_config('role', 'authenticated', true);

    v_detail := '';
    begin
      if t.kind = 'count' then
        execute format(t.stmt, v_owner) into v_count;
        v_got := v_count::text;
      else
        execute format(t.stmt, v_owner);
        get diagnostics v_count = row_count;
        -- Always undo the attempt; the message carries how many rows it touched
        raise exception 'KOHOT_DONE %', v_count;
      end if;
    exception when others then
      if sqlerrm like 'KOHOT_DONE %' then
        v_got := case when split_part(sqlerrm, ' ', 2)::int > 0 then 'עבר' else 'לא שינה כלום' end;
      else
        v_got := case when t.kind = 'count' then 'שגיאה' else 'נחסם' end;
        v_detail := sqlstate || ' ' || left(sqlerrm, 80);
      end if;
    end;

    reset role;
    insert into kohot_rls_results values (
      t.ord, t.label, t.expected, v_got, v_detail,
      case
        when v_got = t.expected then '✅'
        when t.expected = 'חסום' and v_got in ('נחסם', 'לא שינה כלום') then '✅'
        else '❌'
      end
    );
  end loop;
  reset role;
  update public.kohot_members set accepted = v_accepted
  where owner_id = v_owner and user_id = v_helper and accepted <> v_accepted;
end
$$;

select n as "#", ok as "תקין", test as "בדיקה", expected as "צפוי", got as "התקבל", detail as "פרטים"
from kohot_rls_results
order by n;
