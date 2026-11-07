-- PantryPilot: profiles, ratings, photo comments, invites and synced preferences.
-- Run once in Supabase → SQL Editor. Safe to re-run. (Also appended to ../schema.sql for fresh projects.)

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
