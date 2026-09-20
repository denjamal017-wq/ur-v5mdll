-- v17 — financial invariants: no debt underflow, no settlement overpayment,
-- no implicit commission rate, and no approved-extra double counting.
create or replace function public.mdllni_apply_debt(p_provider uuid,p_amount bigint,p_kind text,p_order text,p_note text) returns bigint language plpgsql security definer set search_path to '' as $$
declare v_current bigint;v_new bigint;v_inserted bigint;
begin
  if p_provider is null or p_amount is null or p_amount=0 or nullif(btrim(p_kind),'') is null then raise exception 'invalid_debt_input';end if;
  select debt into v_current from public.mdllni_providers where profile_id=p_provider for update;
  if not found then return null;end if;
  v_new:=v_current+p_amount;
  if v_new<0 then raise exception 'debt_underflow';end if;
  insert into public.mdllni_ledger(provider_id,order_id,kind,amount,balance_after,note,created_at)
  values(p_provider,nullif(p_order,''),p_kind,p_amount,v_new,coalesce(p_note,''),now())
  on conflict do nothing returning id into v_inserted;
  if v_inserted is null then return v_current;end if;
  update public.mdllni_providers set debt=v_new where profile_id=p_provider;
  if not found then raise exception 'provider_missing';end if;
  return v_new;
end $$;
create or replace function public.mdllni_complete_order(p_order text,p_actor uuid) returns jsonb language plpgsql security definer set search_path to '' as $$
declare o public.mdllni_orders%rowtype;v_extra bigint:=0;v_base bigint;v_total bigint;v_unit bigint:=250;v_rate numeric;v_raw numeric;v_commission bigint;v_delta integer;v_debt bigint;v_updated integer;
begin
  select * into o from public.mdllni_orders where id=p_order for update;
  if not found then raise exception 'order_not_found';end if;
  if o.status<>'started' then raise exception 'order_unavailable';end if;
  if o.provider_id is null then raise exception 'provider_missing';end if;
  if o.provider_id<>p_actor and not exists(select 1 from public.mdllni_profiles where id=p_actor and role='admin' and status='active') then raise exception 'forbidden';end if;
  if o.disputed or exists(select 1 from public.mdllni_tickets where order_id=o.id and status='open') then raise exception 'disputed_open';end if;
  if o.final_price is not null and o.final_price<>o.estimate and not o.price_confirmed then raise exception 'price_not_confirmed';end if;
  if jsonb_typeof(coalesce(o.extras,'[]'::jsonb))<>'array' then raise exception 'invalid_extras';end if;
  if exists(select 1 from jsonb_array_elements(coalesce(o.extras,'[]'::jsonb))x where coalesce(x->>'status','') in('pending','proposed')) then raise exception 'extras_pending';end if;
  if exists(select 1 from jsonb_array_elements(coalesce(o.extras,'[]'::jsonb))x where(coalesce(x->>'status','')='approved' or coalesce(x->>'approved','false')='true')and case when coalesce(x->>'amount',x->>'price','')~'^[0-9]+$' then coalesce(x->>'amount',x->>'price')::numeric<=0 or coalesce(x->>'amount',x->>'price')::numeric>2147483647 else true end)then raise exception 'invalid_extra_amount';end if;
  select coalesce(sum(case when coalesce(x->>'status','')='approved' or coalesce(x->>'approved','false')='true' then coalesce(x->>'amount',x->>'price')::bigint else 0 end),0)into v_extra from jsonb_array_elements(coalesce(o.extras,'[]'::jsonb))x;
  v_base:=coalesce(o.final_price,o.estimate);v_total:=v_base+v_extra;
  if v_base<=0 or v_total<=0 then raise exception 'invalid_price';end if;
  select nullif(value->>'roundingUnit','')::bigint into v_unit from public.mdllni_settings where key='debt';v_unit:=greatest(coalesce(v_unit,250),1);
  if o.commission_rate is null then raise exception 'commission_rate_missing';end if;
  v_rate:=o.commission_rate;if v_rate<=0 or v_rate>100 then raise exception 'invalid_commission_rate';end if;
  v_raw:=v_total*v_rate/100;v_commission:=(round(v_raw/v_unit)*v_unit)::bigint;
  if v_commission<=0 or v_commission>2147483647 then raise exception 'invalid_commission_amount';end if;
  v_delta:=round(v_commission-v_raw)::integer;
  if exists(select 1 from public.mdllni_ledger where order_id=o.id and kind='commission')then raise exception 'already_completed';end if;
  v_debt:=public.mdllni_apply_debt(o.provider_id,v_commission,'commission',o.id,'عمولة الطلب المكتمل '||o.id);
  if v_debt is null then raise exception 'provider_missing';end if;
  update public.mdllni_providers set jobs=jobs+1,balance=balance+v_total where profile_id=o.provider_id;get diagnostics v_updated=row_count;
  if v_updated<>1 then raise exception 'provider_missing';end if;
  update public.mdllni_orders set status='done',done_at=now(),final_price=v_base,commission_amount=v_commission,rounding_delta=v_delta,timeline=coalesce(o.timeline,'[]'::jsonb)||jsonb_build_array(jsonb_build_object('s','done','at',(extract(epoch from clock_timestamp())*1000)::bigint))where id=o.id and status='started';get diagnostics v_updated=row_count;
  if v_updated<>1 then raise exception 'order_race';end if;
  insert into public.mdllni_audit_log(actor,action,created_at)values(coalesce((select name from public.mdllni_profiles where id=p_actor),'system'),'إكمال ذري للطلب '||o.id||' — أساس '||v_base||' + إضافات '||v_extra||' — عمولة '||v_commission,now());
  return jsonb_build_object('orderId',o.id,'price',v_total,'basePrice',v_base,'extrasTotal',v_extra,'totalPrice',v_total,'commission',v_commission,'roundingDelta',v_delta,'debt',v_debt);
end $$;
create or replace function public.mdllni_confirm_settlement(p_payout text,p_actor uuid) returns jsonb language plpgsql security definer set search_path to '' as $$
declare po public.mdllni_payouts%rowtype;v_current bigint;v_debt bigint;v_updated integer;
begin
  if not exists(select 1 from public.mdllni_profiles where id=p_actor and role='admin' and status='active')then raise exception 'forbidden';end if;
  select * into po from public.mdllni_payouts where id=p_payout for update;
  if not found or po.status<>'pending' then raise exception 'payout_unavailable';end if;
  if po.amount is null or po.amount<=0 then raise exception 'invalid_payout_amount';end if;
  if coalesce(po.direction,'settlement')<>'settlement' then raise exception 'payout_direction_invalid';end if;
  select debt into v_current from public.mdllni_providers where profile_id=po.provider_id for update;
  if not found then raise exception 'provider_missing';end if;
  if po.amount>v_current then raise exception 'settlement_exceeds_debt';end if;
  v_debt:=public.mdllni_apply_debt(po.provider_id,-po.amount,'payment','', 'تأكيد استلام سداد '||po.id);
  if v_debt is null then raise exception 'provider_missing';end if;
  update public.mdllni_payouts set status='paid',paid_at=now()where id=po.id and status='pending';get diagnostics v_updated=row_count;
  if v_updated<>1 then raise exception 'payout_race';end if;
  update public.mdllni_providers set settled=settled+po.amount where profile_id=po.provider_id;get diagnostics v_updated=row_count;
  if v_updated<>1 then raise exception 'provider_missing';end if;
  insert into public.mdllni_audit_log(actor,action,created_at)values((select name from public.mdllni_profiles where id=p_actor),'تأكيد سداد ذري '||po.id||' — '||po.amount,now());
  return jsonb_build_object('payoutId',po.id,'providerId',po.provider_id,'amount',po.amount,'debt',v_debt);
end $$;
do $$begin
  if not exists(select 1 from pg_constraint where conname='mdllni_providers_debt_nonnegative')then alter table public.mdllni_providers add constraint mdllni_providers_debt_nonnegative check(debt>=0)not valid;end if;
  if not exists(select 1 from pg_constraint where conname='mdllni_payouts_amount_positive')then alter table public.mdllni_payouts add constraint mdllni_payouts_amount_positive check(amount>0)not valid;end if;
  if not exists(select 1 from pg_constraint where conname='mdllni_ledger_balance_nonnegative')then alter table public.mdllni_ledger add constraint mdllni_ledger_balance_nonnegative check(balance_after>=0)not valid;end if;
  if not exists(select 1 from pg_constraint where conname='mdllni_orders_commission_rate_state_check')then alter table public.mdllni_orders add constraint mdllni_orders_commission_rate_state_check check(status not in('started','done')or(commission_rate is not null and commission_rate>0 and commission_rate<=100))not valid;end if;
end $$;
alter table public.mdllni_providers validate constraint mdllni_providers_debt_nonnegative;
alter table public.mdllni_payouts validate constraint mdllni_payouts_amount_positive;
alter table public.mdllni_ledger validate constraint mdllni_ledger_balance_nonnegative;
alter table public.mdllni_orders validate constraint mdllni_orders_commission_rate_state_check;
revoke all on function public.mdllni_apply_debt(uuid,bigint,text,text,text)from public,anon,authenticated;
revoke all on function public.mdllni_complete_order(text,uuid)from public,anon,authenticated;
revoke all on function public.mdllni_confirm_settlement(text,uuid)from public,anon,authenticated;
grant execute on function public.mdllni_apply_debt(uuid,bigint,text,text,text)to service_role;
grant execute on function public.mdllni_complete_order(text,uuid)to service_role;
grant execute on function public.mdllni_confirm_settlement(text,uuid)to service_role;
