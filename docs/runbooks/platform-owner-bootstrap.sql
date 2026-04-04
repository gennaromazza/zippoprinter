-- Bootstrap first platform owner
-- Replace email with your authenticated Supabase auth user email.

insert into platform_admins (auth_user_id, email, is_active)
select u.id, u.email, true
from auth.users u
where lower(u.email) = lower('YOUR_OWNER_EMAIL')
on conflict (auth_user_id) do update
set email = excluded.email,
    is_active = true,
    updated_at = now();

select id, auth_user_id, email, is_active, created_at
from platform_admins
order by created_at desc;
