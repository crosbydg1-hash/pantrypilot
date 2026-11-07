-- PantryPilot database setup.
-- Run this once in your Supabase project: Dashboard → SQL Editor → New query → paste → Run.
-- It is safe to re-run: every statement checks whether its object already exists.

-- ---------------------------------------------------------------------------
-- Profiles: the public name shown next to a person's comments.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  created_at   timestamptz not null default now()
);
alter table public.profiles enable row level security;

drop policy if exists "Profiles are readable by everyone" on public.profiles;
create policy "Profiles are readable by everyone" on public.profiles
  for select using (true);
drop policy if exists "People can rename themselves" on public.profiles;
create policy "People can rename themselves" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Create a profile automatically when someone signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1)), 40)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- User data: pantry, saved recipes, shopping list and meal plan, synced across devices.
-- ---------------------------------------------------------------------------
create table if not exists public.user_data (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  pantry     jsonb not null default '[]'::jsonb,
  favs       jsonb not null default '[]'::jsonb,
  list       jsonb not null default '[]'::jsonb,
  plan       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.user_data enable row level security;

drop policy if exists "People manage only their own data" on public.user_data;
create policy "People manage only their own data" on public.user_data
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Comments under recipes. Anyone can read; only signed-in people can post.
-- A comment is hidden automatically once 3 different people report it.
-- ---------------------------------------------------------------------------
create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  recipe_id  text not null check (char_length(recipe_id) between 1 and 64),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  body       text not null check (char_length(trim(body)) between 1 and 1000),
  hidden     boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists comments_recipe_idx on public.comments (recipe_id, created_at);
alter table public.comments enable row level security;

drop policy if exists "Visible comments are readable by everyone" on public.comments;
create policy "Visible comments are readable by everyone" on public.comments
  for select using (not hidden or auth.uid() = user_id);
drop policy if exists "Signed-in people post as themselves" on public.comments;
create policy "Signed-in people post as themselves" on public.comments
  for insert to authenticated with check (auth.uid() = user_id and hidden = false);
drop policy if exists "People delete their own comments" on public.comments;
create policy "People delete their own comments" on public.comments
  for delete using (auth.uid() = user_id);

-- Slow down spam: at most 10 comments per person per 10 minutes.
create or replace function public.limit_comment_rate()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.comments
      where user_id = new.user_id and created_at > now() - interval '10 minutes') >= 10 then
    raise exception 'You''re commenting very quickly. Wait a few minutes and try again.';
  end if;
  return new;
end;
$$;
drop trigger if exists comments_rate_limit on public.comments;
create trigger comments_rate_limit before insert on public.comments
  for each row execute function public.limit_comment_rate();

-- ---------------------------------------------------------------------------
-- Reports. Review them in Dashboard → Table Editor → comment_reports.
-- ---------------------------------------------------------------------------
create table if not exists public.comment_reports (
  comment_id  uuid not null references public.comments (id) on delete cascade,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reason      text not null default 'inappropriate' check (char_length(reason) <= 200),
  created_at  timestamptz not null default now(),
  primary key (comment_id, reporter_id)
);
alter table public.comment_reports enable row level security;

drop policy if exists "Signed-in people can report" on public.comment_reports;
create policy "Signed-in people can report" on public.comment_reports
  for insert to authenticated with check (auth.uid() = reporter_id);

create or replace function public.hide_reported_comment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.comment_reports where comment_id = new.comment_id) >= 3 then
    update public.comments set hidden = true where id = new.comment_id;
  end if;
  return new;
end;
$$;
drop trigger if exists comment_reports_hide on public.comment_reports;
create trigger comment_reports_hide after insert on public.comment_reports
  for each row execute function public.hide_reported_comment();

-- ---------------------------------------------------------------------------
-- Blocks: hide someone's comments from you.
-- ---------------------------------------------------------------------------
create table if not exists public.blocks (
  user_id    uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, blocked_id),
  check (user_id <> blocked_id)
);
alter table public.blocks enable row level security;

drop policy if exists "People manage their own blocks" on public.blocks;
create policy "People manage their own blocks" on public.blocks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Account deletion from inside the app (required by Apple).
-- Deleting the auth user cascades to the profile, data, comments, reports and blocks.
-- ---------------------------------------------------------------------------
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ===========================================================================
-- PantryPilot Pro
-- ===========================================================================

-- Pro status lives on the profile. Only the server (purchase webhook or you in the dashboard)
-- can change it: people may update their display name and nothing else.
alter table public.profiles add column if not exists is_pro boolean not null default false;
alter table public.profiles add column if not exists pro_until timestamptz;
revoke update on public.profiles from anon, authenticated;
grant update (display_name) on public.profiles to authenticated;

create or replace function public.is_pro(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_pro and (pro_until is null or pro_until > now()) from public.profiles where id = uid), false);
$$;
revoke all on function public.is_pro(uuid) from public, anon, authenticated;

-- Each person's own recipes (imported from a link or photo, or typed in). Private to them.
create table if not exists public.user_recipes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 120),
  description text not null default '' check (char_length(description) <= 600),
  category    text not null default 'dinner' check (category in ('breakfast', 'lunch', 'dinner', 'dessert')),
  image       text check (image is null or char_length(image) <= 400000),
  prep_time   int not null default 0 check (prep_time between 0 and 1440),
  cook_time   int not null default 0 check (cook_time between 0 and 2880),
  calories    int not null default 0 check (calories between 0 and 5000),
  servings    int not null default 2 check (servings between 1 and 50),
  skill_level text not null default 'beginner' check (skill_level in ('beginner', 'intermediate', 'advanced')),
  tags        jsonb not null default '[]'::jsonb,
  ingredients jsonb not null default '[]'::jsonb,
  steps       jsonb not null default '[]'::jsonb,
  source_url  text check (source_url is null or char_length(source_url) <= 2000),
  source_kind text not null default 'manual' check (source_kind in ('link', 'photo', 'manual')),
  created_at  timestamptz not null default now()
);
create index if not exists user_recipes_owner_idx on public.user_recipes (user_id, created_at desc);
alter table public.user_recipes enable row level security;

drop policy if exists "People manage only their own recipes" on public.user_recipes;
create policy "People manage only their own recipes" on public.user_recipes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Import log, used by the import-recipe function to cap use at 40 imports per person per day.
create table if not exists public.import_log (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  kind       text not null check (kind in ('link', 'photo')),
  ok         boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists import_log_user_idx on public.import_log (user_id, created_at desc);
alter table public.import_log enable row level security;
-- No policies: only the server function (service role) reads and writes this table.

-- ===========================================================================
-- Stripe payments (website)
-- ===========================================================================
-- Links each person to their Stripe customer, and remembers whether they've had the free trial.
-- Only the payment server functions write these (people can still update only their display name).
alter table public.profiles add column if not exists stripe_customer_id text unique;
alter table public.profiles add column if not exists had_trial boolean not null default false;
-- Keep payment details private: the public can read names (for comments) and Pro status, nothing else.
revoke select on public.profiles from anon, authenticated;
grant select (id, display_name, created_at, is_pro, pro_until) on public.profiles to anon, authenticated;

-- ===========================================================================
-- Profiles, ratings, photo comments, invites, preferences (see migrations/2026-11-06-profiles-ratings-invites.sql)
-- ===========================================================================
-- Profile: emoji avatar, short bio, invite code and bonus Pro from invites.
alter table public.profiles add column if not exists avatar text check (avatar is null or char_length(avatar) <= 16);
alter table public.profiles add column if not exists bio text check (bio is null or char_length(bio) <= 160);
alter table public.profiles add column if not exists referral_code text unique;
alter table public.profiles add column if not exists referred_by uuid references public.profiles (id) on delete set null;
alter table public.profiles add column if not exists referral_rewarded boolean not null default false;
alter table public.profiles add column if not exists bonus_until timestamptz;

grant update (display_name, avatar, bio) on public.profiles to authenticated;
grant select (id, display_name, created_at, is_pro, pro_until, avatar, bio, referral_code, bonus_until) on public.profiles to anon, authenticated;

-- Give everyone an invite code (existing profiles too).
create or replace function public.new_referral_code()
returns text language plpgsql set search_path = public as $$
declare c text;
begin
  loop
    c := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 7));
    exit when not exists (select 1 from public.profiles where referral_code = c);
  end loop;
  return c;
end;
$$;
update public.profiles set referral_code = public.new_referral_code() where referral_code is null;

-- Pro counts if paid (Stripe) or if an invite bonus is still running.
create or replace function public.is_pro(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select (is_pro and (pro_until is null or pro_until > now())) or coalesce(bonus_until > now(), false)
                   from public.profiles where id = uid), false);
$$;
revoke all on function public.is_pro(uuid) from public, anon, authenticated;

-- Invites: when someone who signed up with a friend's code confirms their email,
-- both get 7 days of Pro. Each person can earn at most 10 invite weeks.
create or replace function public.grant_referral(uid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare ref uuid; earned int;
begin
  select referred_by into ref from public.profiles where id = uid and not referral_rewarded;
  if ref is null then return; end if;
  update public.profiles set referral_rewarded = true,
    bonus_until = greatest(coalesce(bonus_until, now()), now()) + interval '7 days' where id = uid;
  select count(*) into earned from public.profiles where referred_by = ref and referral_rewarded;
  if earned <= 10 then
    update public.profiles set bonus_until = greatest(coalesce(bonus_until, now()), now()) + interval '7 days' where id = ref;
  end if;
end;
$$;
revoke all on function public.grant_referral(uuid) from public, anon, authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare ref uuid;
begin
  select id into ref from public.profiles
   where referral_code = upper(nullif(trim(new.raw_user_meta_data ->> 'ref'), '')) limit 1;
  insert into public.profiles (id, display_name, referral_code, referred_by)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1)), 40),
    public.new_referral_code(),
    ref
  )
  on conflict (id) do nothing;
  if new.email_confirmed_at is not null then perform public.grant_referral(new.id); end if;
  return new;
end;
$$;

create or replace function public.handle_user_confirmed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    perform public.grant_referral(new.id);
  end if;
  return new;
end;
$$;
drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row execute function public.handle_user_confirmed();

-- Synced extras: preferences (diet, allergies, household, cuisines, birthday, emails), cooking log, gifts.
alter table public.user_data add column if not exists prefs jsonb not null default '{}'::jsonb;
alter table public.user_data add column if not exists cooked jsonb not null default '[]'::jsonb;
alter table public.user_data add column if not exists gifts jsonb not null default '[]'::jsonb;

-- Star ratings: one per person per recipe, readable by everyone.
create table if not exists public.ratings (
  user_id    uuid not null references auth.users (id) on delete cascade,
  recipe_id  text not null check (char_length(recipe_id) between 1 and 64),
  stars      smallint not null check (stars between 1 and 5),
  updated_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);
alter table public.ratings enable row level security;
drop policy if exists "Ratings are readable by everyone" on public.ratings;
create policy "Ratings are readable by everyone" on public.ratings for select using (true);
drop policy if exists "People manage their own ratings" on public.ratings;
create policy "People manage their own ratings" on public.ratings
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace view public.recipe_ratings with (security_invoker = true) as
  select recipe_id, round(avg(stars)::numeric, 1) as average, count(*)::int as count
  from public.ratings group by recipe_id;
grant select on public.recipe_ratings to anon, authenticated;

-- "I made this!" comments can carry a photo and a rating.
alter table public.comments add column if not exists photo text check (photo is null or (photo like 'data:image/jpeg;base64,%' and char_length(photo) <= 400000));
alter table public.comments add column if not exists rating smallint check (rating is null or rating between 1 and 5);
-- Photo-only posts are allowed, so the body may be empty when there is a photo.
alter table public.comments drop constraint if exists comments_body_check;
alter table public.comments add constraint comments_body_check
  check (char_length(body) <= 1000 and (char_length(trim(body)) >= 1 or photo is not null));

-- ===========================================================================
-- Community recipes (see migrations/2026-11-07-community-recipes.sql)
-- ===========================================================================
alter table public.user_recipes add column if not exists published boolean not null default false;
alter table public.user_recipes add column if not exists published_at timestamptz;
alter table public.user_recipes add column if not exists hidden boolean not null default false;
create index if not exists user_recipes_published_idx on public.user_recipes (published_at desc) where published and not hidden;

-- Anyone can read shared recipes that haven't been hidden by moderation.
drop policy if exists "Shared recipes are readable by everyone" on public.user_recipes;
create policy "Shared recipes are readable by everyone" on public.user_recipes
  for select using (published and not hidden);

-- People can't un-hide a recipe moderation hid, and sharing stamps the time.
-- At most 20 newly shared recipes per person per day, to slow down spam.
create or replace function public.guard_user_recipe()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
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
drop trigger if exists user_recipes_guard on public.user_recipes;
create trigger user_recipes_guard before insert or update on public.user_recipes
  for each row execute function public.guard_user_recipe();

-- Reports on shared recipes. 3 reports from different people hides the recipe.
-- Review them in Table Editor → recipe_reports; un-hide by setting user_recipes.hidden = false.
create table if not exists public.recipe_reports (
  recipe_id   uuid not null references public.user_recipes (id) on delete cascade,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reason      text not null default 'inappropriate' check (char_length(reason) <= 200),
  created_at  timestamptz not null default now(),
  primary key (recipe_id, reporter_id)
);
alter table public.recipe_reports enable row level security;
drop policy if exists "Signed-in people can report recipes" on public.recipe_reports;
create policy "Signed-in people can report recipes" on public.recipe_reports
  for insert to authenticated with check (auth.uid() = reporter_id);

create or replace function public.hide_reported_recipe()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.recipe_reports where recipe_id = new.recipe_id) >= 3 then
    update public.user_recipes set hidden = true where id = new.recipe_id;
  end if;
  return new;
end;
$$;
drop trigger if exists recipe_reports_hide on public.recipe_reports;
create trigger recipe_reports_hide after insert on public.recipe_reports
  for each row execute function public.hide_reported_recipe();

-- More recipe categories (see migrations/2026-11-07-more-categories.sql)
alter table public.user_recipes drop constraint if exists user_recipes_category_check;
alter table public.user_recipes add constraint user_recipes_category_check
  check (category in ('breakfast', 'lunch', 'dinner', 'appetizer', 'dip', 'dessert', 'drink'));

-- ===========================================================================
-- Households, moderation, pantry dates, sides (see migrations/2026-11-08-households-moderation.sql)
-- ===========================================================================
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

-- Receipt scanning (Pro) shares the daily import limit.
alter table public.import_log drop constraint if exists import_log_kind_check;
alter table public.import_log add constraint import_log_kind_check check (kind in ('link', 'photo', 'receipt'));

-- Lets admins give Pro to anyone for free (or take it away) from the Admin page.
-- Only accounts with profiles.is_admin = true can call these; everyone else gets an error.

-- p_months: null = Pro forever, 0 = remove Pro, any other number = Pro for that many months from now.
create or replace function public.admin_set_pro(p_email text, p_months int)
returns table (display_name text, is_pro boolean, pro_until timestamptz)
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not public.is_admin() then raise exception 'Only admins can change Pro.'; end if;
  if p_months is not null and (p_months < 0 or p_months > 120) then raise exception 'Pick between 1 and 120 months.'; end if;
  select u.id into uid from auth.users u where lower(u.email) = lower(trim(p_email));
  if uid is null then raise exception 'No PantryPilot account uses that email yet. Ask them to sign up first.'; end if;
  update public.profiles p
     set is_pro = coalesce(p_months, 1) <> 0,
         pro_until = case when p_months is null or p_months = 0 then null else now() + make_interval(months => p_months) end
   where p.id = uid;
  return query select p.display_name, p.is_pro, p.pro_until from public.profiles p where p.id = uid;
end $$;

-- Everyone who currently has Pro (paid or free), newest first, with their email so admins can find them.
create or replace function public.admin_list_pro()
returns table (email text, display_name text, pro_until timestamptz, paid boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only admins can see this.'; end if;
  return query
    select u.email::text, p.display_name, p.pro_until, p.stripe_customer_id is not null
      from public.profiles p join auth.users u on u.id = p.id
     where p.is_pro and (p.pro_until is null or p.pro_until > now())
     order by p.created_at desc limit 200;
end $$;

revoke all on function public.admin_set_pro(text, int) from public, anon;
revoke all on function public.admin_list_pro() from public, anon;
grant execute on function public.admin_set_pro(text, int) to authenticated;
grant execute on function public.admin_list_pro() to authenticated;
