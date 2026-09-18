-- v13 — مدللني: إعادة تسمية تحفظ كل البيانات + هوية وأجهزة متكيفة.
begin;

-- الرمز المحلي مؤقت/منتهي ولا يمثل أموالاً أو بيانات عمل؛ Supabase Auth صار المصدر الوحيد.
drop table if exists public.ur_email_otps cascade;

-- إعادة تسمية الجداول الحقيقية بالـ OID نفسه؛ الصفوف والعلاقات والبيانات المالية لا تُنسخ ولا تُحذف.
do $$
declare old_name text; new_name text;
begin
  foreach old_name in array array[
    'ur_audit_log','ur_categories','ur_counters','ur_devices','ur_ledger','ur_notifications',
    'ur_order_messages','ur_orders','ur_payouts','ur_profiles','ur_providers','ur_rate_limits',
    'ur_reviews','ur_security_events','ur_services','ur_settings','ur_ticket_messages','ur_tickets'
  ] loop
    new_name := 'mdllni_' || substr(old_name,4);
    if to_regclass('public.' || old_name) is not null and to_regclass('public.' || new_name) is null then
      execute format('alter table public.%I rename to %I', old_name, new_name);
    elsif to_regclass('public.' || old_name) is not null and to_regclass('public.' || new_name) is not null then
      raise exception 'Both % and % exist; refusing ambiguous migration', old_name, new_name;
    end if;
  end loop;
end $$;

-- أسماء الدوال القديمة، ثم إعادة تعريف أجسامها بالأسماء الجديدة حتى لا يبقى اعتماد نصي قديم.
do $$
declare r record;
begin
  for r in select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) args
           from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname in ('ur_next_seq','ur_apply_debt')
  loop
    execute format('alter function public.%I(%s) rename to %I', r.proname, r.args, 'mdllni_' || substr(r.proname,4));
  end loop;
end $$;

-- القيود، الفهارس، والتسلسلات: أسماء فقط، من دون تغيير قيم أو مفاتيح.
do $$
declare r record; target text;
begin
  for r in select c.conrelid::regclass rel, c.conname
           from pg_constraint c join pg_namespace n on n.oid=c.connamespace
           where n.nspname='public' and c.conname like 'ur\_%' escape '\'
  loop
    target := 'mdllni_' || substr(r.conname,4);
    execute format('alter table %s rename constraint %I to %I', r.rel, r.conname, target);
  end loop;
  for r in select c.relname
           from pg_class c join pg_namespace n on n.oid=c.relnamespace
           where n.nspname='public' and c.relkind='i' and c.relname like 'ur\_%' escape '\'
  loop
    target := 'mdllni_' || substr(r.relname,4);
    if to_regclass('public.' || target) is null then execute format('alter index public.%I rename to %I', r.relname, target); end if;
  end loop;
  for r in select c.relname
           from pg_class c join pg_namespace n on n.oid=c.relnamespace
           where n.nspname='public' and c.relkind='S' and c.relname like 'ur\_%' escape '\'
  loop
    target := 'mdllni_' || substr(r.relname,4);
    if to_regclass('public.' || target) is null then execute format('alter sequence public.%I rename to %I', r.relname, target); end if;
  end loop;
end $$;

alter table public.mdllni_profiles add column if not exists auth_user_id uuid;
create unique index if not exists mdllni_profiles_auth_user_uniq on public.mdllni_profiles(auth_user_id) where auth_user_id is not null;

alter table public.mdllni_devices add column if not exists trusted_until timestamptz;
alter table public.mdllni_devices add column if not exists last_ip text not null default '';
alter table public.mdllni_devices add column if not exists user_agent_hash text not null default '';
alter table public.mdllni_devices add column if not exists risk_score int not null default 0 check (risk_score between 0 and 100);
alter table public.mdllni_devices add column if not exists revoked_at timestamptz;
alter table public.mdllni_devices add column if not exists revoked_reason text not null default '';

-- بصمة الجهاز إشارة خطر وليست هوية عالمية: الجهاز العائلي مسموح، والتعامل الذاتي يبقى مراقباً.
drop index if exists public.mdllni_devices_active_fp;
create unique index if not exists mdllni_devices_profile_fp_active on public.mdllni_devices(profile_id,fingerprint) where status='active';
create index if not exists mdllni_devices_fingerprint_idx on public.mdllni_devices(fingerprint,last_seen desc);
create index if not exists mdllni_devices_trust_idx on public.mdllni_devices(profile_id,status,trusted_until);

-- أول دخول بعد الترحيل يطلب OTP مرة واحدة، ثم تبدأ نافذة الثقة الجديدة.
update public.mdllni_devices set trusted_until=now() where status='active' and trusted_until is null;

-- ربط حساب الإدارة الموجود بهوية Supabase المؤكدة، من دون تغيير كلمة مروره أو سجلاته.
update public.mdllni_profiles p
set email=u.email, email_verified=(u.email_confirmed_at is not null), auth_user_id=u.id
from auth.users u
where p.role='admin' and p.phone='07838181890' and lower(u.email)=lower('denjamal017@gmail.com')
  and not exists (select 1 from public.mdllni_profiles x where x.id<>p.id and lower(x.email)=lower(u.email));

-- إزالة آثار الحظر الدائم/OTP المحلي القديمة فقط؛ حدود المال والطلبات لا تُمس.
delete from public.mdllni_rate_limits where key like 'lf:%' or key like 'otp:%' or key like 'reg:ip:%' or key like 'reg:dev:%' or key like 'ban:%';

create or replace function public.mdllni_next_seq(p_kind text, p_start bigint default 1)
returns bigint language plpgsql set search_path to '' as $$
declare v bigint;
begin
  insert into public.mdllni_counters as c(kind,value) values(p_kind,p_start)
  on conflict(kind) do update set value=c.value+1 returning value into v;
  return v;
end $$;

create or replace function public.mdllni_apply_debt(p_provider uuid,p_amount bigint,p_kind text,p_order text,p_note text)
returns bigint language plpgsql security definer set search_path to 'public' as $$
declare v_debt bigint; v_inserted bigint;
begin
  update public.mdllni_providers set debt=greatest(0,debt+p_amount) where profile_id=p_provider returning debt into v_debt;
  if not found then return null; end if;
  insert into public.mdllni_ledger(provider_id,order_id,kind,amount,balance_after,note,created_at)
  values(p_provider,nullif(p_order,''),p_kind,p_amount,v_debt,coalesce(p_note,''),now())
  on conflict do nothing returning id into v_inserted;
  if v_inserted is null then
    update public.mdllni_providers set debt=greatest(0,debt-p_amount) where profile_id=p_provider returning debt into v_debt;
  end if;
  return v_debt;
end $$;
revoke all on function public.mdllni_apply_debt(uuid,bigint,text,text,text) from public,anon,authenticated;
grant execute on function public.mdllni_apply_debt(uuid,bigint,text,text,text) to service_role;

-- RLS يبقى مفعلاً؛ الوصول التطبيقي من خادم Vercel فقط.
do $$ declare r record; begin
  for r in select tablename from pg_tables where schemaname='public' and tablename like 'mdllni\_%' escape '\'
  loop execute format('alter table public.%I enable row level security',r.tablename); end loop;
end $$;

-- ضمان عدم بقاء كائنات تشغيلية بالبادئة القديمة (سجل migration التاريخي مستثنى طبيعياً).
do $$
declare leftovers text;
begin
  select string_agg(kind || ':' || name, ', ' order by kind,name) into leftovers
  from (
    select 'table' kind, tablename name from pg_tables where schemaname='public' and tablename like 'ur\_%' escape '\'
    union all select 'sequence',sequence_name from information_schema.sequences where sequence_schema='public' and sequence_name like 'ur\_%' escape '\'
    union all select 'function',p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'ur\_%' escape '\'
    union all select 'index',indexname from pg_indexes where schemaname='public' and indexname like 'ur\_%' escape '\'
  ) s;
  if leftovers is not null then raise exception 'Legacy runtime objects remain: %',leftovers; end if;
end $$;
commit;
