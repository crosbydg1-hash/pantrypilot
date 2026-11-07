-- PantryPilot: allow appetizer, dip and drink recipes. Run once in Supabase → SQL Editor. Safe to re-run.
alter table public.user_recipes drop constraint if exists user_recipes_category_check;
alter table public.user_recipes add constraint user_recipes_category_check
  check (category in ('breakfast', 'lunch', 'dinner', 'appetizer', 'dip', 'dessert', 'drink'));
