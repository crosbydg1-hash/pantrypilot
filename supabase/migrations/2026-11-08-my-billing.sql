-- Lets the app know whether the signed-in person pays through Stripe, so people given free Pro
-- by an admin don't see a "Manage subscription" button that can't work for them.
-- The Stripe customer id itself stays private; this only answers yes or no for your own account.
create or replace function public.my_billing()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select stripe_customer_id is not null from public.profiles where id = auth.uid()), false);
$$;
revoke all on function public.my_billing() from public, anon;
grant execute on function public.my_billing() to authenticated;
