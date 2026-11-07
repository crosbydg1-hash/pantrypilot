-- PantryPilot: community recipes. People can share their own recipes publicly.
-- Run once in Supabase → SQL Editor. Safe to re-run. (Also appended to ../schema.sql.)

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
