-- PantryPilot: shared household shopping lists, moderation for admins, pantry freshness dates, and a Sides category.
-- Run once in Supabase → SQL Editor. Safe to re-run. (Also appended to ../schema.sql.)

-- ---------------------------------------------------------------------------
-- Pantry freshness dates ("use it up" reminders), synced with the rest of a person's data.
-- ---------------------------------------------------------------------------
alter table public.user_data add column if not exists pantry_dates jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- Sides (stuffing, mashed potatoes...) as their own category.
-- ---------------------------------------------------------------------------
alter table public.user_recipes drop constraint if exists user_recipes_category_check;
alter table public.user_recipes add constraint user_recipes_category_check
  check (category in ('breakfast', 'lunch', 'dinner', 'side', 'appetizer', 'dip', 'dessert', 'drink'));

-- ---------------------------------------------------------------------------
-- Households: people who share one shopping list. Each person can be in one household.
-- ---------------------------------------------------------------------------
create table if not exists public.households (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id      uuid not null unique references auth.users (id) on delete cascade,
  joined_at    timestamptz not null default now(),
  primary key (household_id, user_id)
);
create table if not exists public.list_items (
  household_id uuid not null references public.households (id) on delete cascade,
  id           text not null check (char_length(id) between 1 and 200),
  name         text not null check (char_length(name) between 1 and 120),
  qty          numeric not null default 0,
  unit         text not null default '',
  aisle        text not null default 'Added by you',
  sources      jsonb not null default '[]'::jsonb,
  done         boolean not null default false,
  updated_by   uuid references auth.users (id) on delete set null,
  updated_at   timestamptz not null default now(),
  primary key (household_id, id)
);
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.list_items enable row level security;

create or replace function public.my_household()
returns uuid language sql stable security definer set search_path = public as $$
  select household_id from public.household_members where user_id = auth.uid();
$$;

drop policy if exists "Members see their household" on public.households;
create policy "Members see their household" on public.households for select using (id = public.my_household());
drop policy if exists "Members see each other" on public.household_members;
create policy "Members see each other" on public.household_members for select using (household_id = public.my_household());
drop policy if exists "Members leave" on public.household_members;
create policy "Members leave" on public.household_members for delete using (user_id = auth.uid());
drop policy if exists "Members manage the shared list" on public.list_items;
create policy "Members manage the shared list" on public.list_items
  for all to authenticated using (household_id = public.my_household()) with check (household_id = public.my_household());

-- Start a household (you become its first member) and get its invite code.
create or replace function public.create_household()
returns text language plpgsql security definer set search_path = public as $$
declare hid uuid; c text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if exists (select 1 from public.household_members where user_id = auth.uid()) then
    select h.code into c from public.households h join public.household_members m on m.household_id = h.id where m.user_id = auth.uid();
    return c;
  end if;
  loop
    c := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from public.households where code = c);
  end loop;
  insert into public.households (code, created_by) values (c, auth.uid()) returning id into hid;
  insert into public.household_members (household_id, user_id) values (hid, auth.uid());
  return c;
end;
$$;

-- Join with a code (leaves any household you were in). Households hold up to 8 people.
create or replace function public.join_household(join_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select id into hid from public.households where code = upper(trim(join_code));
  if hid is null then raise exception 'That code doesn''t match a shared list. Check it and try again.'; end if;
  if (select count(*) from public.household_members where household_id = hid) >= 8 then
    raise exception 'That shared list already has 8 people.';
  end if;
  delete from public.household_members where user_id = auth.uid();
  insert into public.household_members (household_id, user_id) values (hid, auth.uid());
  return hid;
end;
$$;

-- Names of the people in your household (profiles are public anyway; this keeps it to one call).
create or replace function public.household_people()
returns table (user_id uuid, display_name text, avatar text) language sql stable security definer set search_path = public as $$
  select m.user_id, p.display_name, p.avatar from public.household_members m join public.profiles p on p.id = m.user_id
  where m.household_id = public.my_household() order by m.joined_at;
$$;

revoke all on function public.create_household() from public, anon;
revoke all on function public.join_household(text) from public, anon;
revoke all on function public.household_people() from public, anon;
grant execute on function public.create_household() to authenticated;
grant execute on function public.join_household(text) to authenticated;
grant execute on function public.household_people() to authenticated;

-- Live updates for the shared list.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'list_items') then
    alter publication supabase_realtime add table public.list_items;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Moderation: admins can review reports and hide, unhide or delete comments and shared recipes.
-- Make yourself an admin in Table Editor → profiles → is_admin = true.
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists is_admin boolean not null default false;
grant select (id, display_name, created_at, is_pro, pro_until, avatar, bio, referral_code, bonus_until, is_admin) on public.profiles to anon, authenticated;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

drop policy if exists "Admins see all comments" on public.comments;
create policy "Admins see all comments" on public.comments for select using (public.is_admin());
drop policy if exists "Admins update comments" on public.comments;
create policy "Admins update comments" on public.comments for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Admins delete comments" on public.comments;
create policy "Admins delete comments" on public.comments for delete using (public.is_admin());
grant update (hidden) on public.comments to authenticated;

drop policy if exists "Admins see reports" on public.comment_reports;
create policy "Admins see reports" on public.comment_reports for select using (public.is_admin());
drop policy if exists "Admins clear reports" on public.comment_reports;
create policy "Admins clear reports" on public.comment_reports for delete using (public.is_admin());
drop policy if exists "Admins see recipe reports" on public.recipe_reports;
create policy "Admins see recipe reports" on public.recipe_reports for select using (public.is_admin());
drop policy if exists "Admins clear recipe reports" on public.recipe_reports;
create policy "Admins clear recipe reports" on public.recipe_reports for delete using (public.is_admin());

drop policy if exists "Admins see all shared recipes" on public.user_recipes;
create policy "Admins see all shared recipes" on public.user_recipes for select using (public.is_admin() and published);
drop policy if exists "Admins moderate shared recipes" on public.user_recipes;
create policy "Admins moderate shared recipes" on public.user_recipes for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Admins delete shared recipes" on public.user_recipes;
create policy "Admins delete shared recipes" on public.user_recipes for delete using (public.is_admin());

-- Let admins (not regular people) change the hidden flag on shared recipes.
create or replace function public.guard_user_recipe()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    new.hidden := case when tg_op = 'UPDATE' then old.hidden else false end;
  end if;
  if new.published and (tg_op = 'INSERT' or not old.published) then
    if (select count(*) from public.user_recipes
        where user_id = new.user_id and published and published_at > now() - interval '1 day') >= 20 then
      raise exception 'You''ve shared a lot of recipes today. Try again tomorrow.';
    end if;
    new.published_at := now();
  end if;
  return new;
end;
$$;
