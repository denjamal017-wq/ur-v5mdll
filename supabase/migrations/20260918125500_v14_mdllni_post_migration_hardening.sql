-- v14 — تنظيف ما بعد ترحيل مدللني: إزالة فهرس مكرر وتقييد دوال الكتابة.
begin;

drop index if exists public.mdllni_devices_profile_fp;
create index if not exists mdllni_security_events_profile_idx
  on public.mdllni_security_events(profile_id, created_at desc);

revoke all on function public.mdllni_next_seq(text,bigint) from public,anon,authenticated;
grant execute on function public.mdllni_next_seq(text,bigint) to service_role;
revoke all on function public.mdllni_apply_debt(uuid,bigint,text,text,text) from public,anon,authenticated;
grant execute on function public.mdllni_apply_debt(uuid,bigint,text,text,text) to service_role;

-- RLS بلا سياسات مقصود: المتصفح لا يصل للجداول؛ Vercel يستخدم service_role فقط.
revoke all on all tables in schema public from anon,authenticated;
revoke all on all sequences in schema public from anon,authenticated;

commit;
