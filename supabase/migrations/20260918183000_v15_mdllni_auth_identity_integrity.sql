-- v15 — كل بريد موثّق في مدللني مرتبط بهوية Supabase Auth واحدة.

update public.mdllni_profiles p
set auth_user_id = u.id,
    email_verified = (u.email_confirmed_at is not null)
from auth.users u
where p.auth_user_id is null
  and p.email is not null
  and lower(p.email)=lower(u.email)
  and (select count(*) from public.mdllni_profiles p2 where lower(p2.email)=lower(p.email))=1
  and (select count(*) from auth.users u2 where lower(u2.email)=lower(u.email))=1;

create unique index if not exists mdllni_profiles_email_lower_uniq
  on public.mdllni_profiles(lower(email)) where email is not null;

alter table public.mdllni_profiles
  drop constraint if exists mdllni_profiles_auth_user_id_fkey;
alter table public.mdllni_profiles
  add constraint mdllni_profiles_auth_user_id_fkey
  foreign key (auth_user_id) references auth.users(id) on delete restrict not valid;
alter table public.mdllni_profiles
  validate constraint mdllni_profiles_auth_user_id_fkey;

alter table public.mdllni_profiles
  drop constraint if exists mdllni_profiles_verified_identity_check;
alter table public.mdllni_profiles
  add constraint mdllni_profiles_verified_identity_check
  check (not email_verified or auth_user_id is not null) not valid;
alter table public.mdllni_profiles
  validate constraint mdllni_profiles_verified_identity_check;
