-- v18 — per-device session epochs and atomic, NAT-tolerant login cooldowns.
alter table public.mdllni_devices add column if not exists session_version bigint not null default 1;
update public.mdllni_devices set session_version=1 where session_version is null or session_version<1;
do $$begin
 if not exists(select 1 from pg_constraint where conname='mdllni_devices_session_version_check')then alter table public.mdllni_devices add constraint mdllni_devices_session_version_check check(session_version>=1)not valid;end if;
 if not exists(select 1 from pg_constraint where conname='mdllni_profiles_verified_auth_link_check')then alter table public.mdllni_profiles add constraint mdllni_profiles_verified_auth_link_check check(not email_verified or auth_user_id is not null)not valid;end if;
end $$;
alter table public.mdllni_devices validate constraint mdllni_devices_session_version_check;
alter table public.mdllni_profiles validate constraint mdllni_profiles_verified_auth_link_check;
create or replace function public.mdllni_login_failure(p_key text,p_now_ms bigint,p_scope text)returns jsonb language plpgsql security definer set search_path to '' as $$
declare r public.mdllni_rate_limits%rowtype;v_count integer;v_first bigint;v_wait bigint:=0;v_until bigint:=0;v_existing bigint:=0;
begin
 if p_key is null or length(p_key)<8 or p_now_ms is null or p_now_ms<1 or p_scope not in('account','network')then raise exception 'bad_login_limit_input';end if;
 insert into public.mdllni_rate_limits(key,count,first,items,updated_at)values(p_key,0,p_now_ms,'[0]'::jsonb,now())on conflict(key)do nothing;
 select * into r from public.mdllni_rate_limits where key=p_key for update;
 if p_now_ms-coalesce(r.first,0)>=3600000 then v_count:=1;v_first:=p_now_ms;v_existing:=0;else v_count:=coalesce(r.count,0)+1;v_first:=coalesce(r.first,p_now_ms);begin v_existing:=coalesce(nullif(r.items->>0,'')::bigint,0);exception when others then v_existing:=0;end;end if;
 if p_scope='account' then v_wait:=case when v_count>=12 then 3600000 when v_count>=8 then 900000 when v_count>=5 then 60000 else 0 end;else v_wait:=case when v_count>=80 then 3600000 when v_count>=40 then 900000 when v_count>=20 then 60000 else 0 end;end if;
 v_until:=greatest(v_existing,case when v_wait>0 then p_now_ms+v_wait else 0 end);
 update public.mdllni_rate_limits set count=v_count,first=v_first,items=jsonb_build_array(v_until),updated_at=now()where key=p_key;
 return jsonb_build_object('count',v_count,'first',v_first,'until',v_until,'scope',p_scope);
end $$;
revoke all on function public.mdllni_login_failure(text,bigint,text)from public,anon,authenticated;
grant execute on function public.mdllni_login_failure(text,bigint,text)to service_role;
