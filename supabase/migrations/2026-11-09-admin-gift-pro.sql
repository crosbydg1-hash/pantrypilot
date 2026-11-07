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
