-- =====================================================================
--  أور UR — Supabase / PostgreSQL schema  (v6)
--  شغّل هذا الملف مرة واحدة من:  Supabase Dashboard > SQL Editor > New query
--  كل الجداول محمية بـ RLS ولا يمكن الوصول لها إلا من السيرفر (service_role)
-- =====================================================================

create extension if not exists pgcrypto;

-- ------------------------- counters (atomic ids) ----------------------
create table if not exists ur_counters (
  kind text primary key,
  value bigint not null default 0
);

create or replace function ur_next_seq(p_kind text, p_start bigint default 1)
returns bigint
language plpgsql
as $$
declare v bigint;
begin
  insert into ur_counters(kind, value) values (p_kind, p_start)
  on conflict (kind) do update set value = ur_counters.value + 1
  returning value into v;
  return v;
end $$;

-- ------------------------- categories ---------------------------------
create table if not exists ur_categories (
  id    text primary key,
  name  text not null,
  icon  text not null default '',
  sort  int  not null default 0
);

-- ------------------------- services -----------------------------------
create table if not exists ur_services (
  id          text primary key,
  icon        text not null default '',
  name        text not null,
  cat         text not null references ur_categories(id) on update cascade,
  min_price   int  not null check (min_price >= 0),
  max_price   int  not null check (max_price >= min_price),
  unit        text not null default '',
  popular     boolean not null default false,
  wave        int  not null default 1 check (wave between 1 and 3),
  active      boolean not null default true,
  sensitive   boolean not null default false,
  gold        boolean not null default false,
  description text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists ur_services_cat_idx on ur_services(cat) where active;

-- ------------------------- profiles (users) ---------------------------
create table if not exists ur_profiles (
  id         uuid primary key default gen_random_uuid(),
  role       text not null check (role in ('customer','provider','admin')),
  name       text not null,
  phone      text not null unique check (phone ~ '^07[0-9]{9}$'),
  pass_hash  text not null,
  area       text not null default '',
  status     text not null default 'active' check (status in ('active','suspended')),
  created_at timestamptz not null default now()
);
create index if not exists ur_profiles_role_idx on ur_profiles(role);

-- ------------------------- providers ----------------------------------
create table if not exists ur_providers (
  profile_id   uuid primary key references ur_profiles(id) on delete cascade,
  service_id   text not null references ur_services(id),
  exp          int  not null default 0 check (exp >= 0),
  areas        text[] not null default '{}',
  verified     text not null default 'pending' check (verified in ('pending','verified','rejected')),
  avail        boolean not null default true,
  rating_sum   int  not null default 0,
  rating_count int  not null default 0,
  jobs         int  not null default 0,
  balance      bigint not null default 0 check (balance >= 0),
  settled      bigint not null default 0 check (settled >= 0),
  sensitive    boolean not null default false
);
create index if not exists ur_providers_match_idx on ur_providers(service_id, verified, avail);

-- ------------------------- orders -------------------------------------
create table if not exists ur_orders (
  id              text primary key,
  service_id      text not null references ur_services(id),
  customer_id     uuid not null references ur_profiles(id) on delete cascade,
  provider_id     uuid references ur_profiles(id) on delete set null,
  description     text not null,
  area            text not null,
  address         text not null default '',
  when_type       text not null default 'now' check (when_type in ('now','scheduled')),
  when_time       text,
  pay_method      text not null default 'cash' check (pay_method in ('cash','wallet')),
  estimate        int  not null check (estimate > 0),
  final_price     int  check (final_price > 0),
  price_confirmed boolean not null default false,
  status          text not null default 'pending'
                  check (status in ('pending','accepted','enroute','started','done','cancelled')),
  commission_rate numeric(5,2),
  timeline        jsonb not null default '[]'::jsonb,
  rejected_by     uuid[] not null default '{}',
  disputed        boolean not null default false,
  cancel_reason   text,
  cancelled_by    uuid references ur_profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  done_at         timestamptz
);
create index if not exists ur_orders_customer_idx on ur_orders(customer_id, created_at desc);
create index if not exists ur_orders_provider_idx on ur_orders(provider_id, created_at desc);
create index if not exists ur_orders_open_idx     on ur_orders(service_id, area) where status = 'pending';

-- ------------------------- reviews (1:1 order) ------------------------
create table if not exists ur_reviews (
  order_id   text primary key references ur_orders(id) on delete cascade,
  stars      int  not null check (stars between 1 and 5),
  body       text not null default '',
  created_at timestamptz not null default now()
);

-- ------------------------- order chat ---------------------------------
create table if not exists ur_order_messages (
  id         bigserial primary key,
  order_id   text not null references ur_orders(id) on delete cascade,
  from_id    uuid not null references ur_profiles(id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);
create index if not exists ur_order_messages_idx on ur_order_messages(order_id, created_at);

-- ------------------------- notifications ------------------------------
create table if not exists ur_notifications (
  id         bigserial primary key,
  user_id    uuid not null references ur_profiles(id) on delete cascade,
  icon       text not null default '',
  body       text not null,
  order_id   text references ur_orders(id) on delete set null,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists ur_notifications_idx on ur_notifications(user_id, created_at desc);

-- ------------------------- support tickets ----------------------------
create table if not exists ur_tickets (
  id         text primary key,
  user_id    uuid not null references ur_profiles(id) on delete cascade,
  order_id   text references ur_orders(id) on delete set null,
  subject    text not null,
  status     text not null default 'open' check (status in ('open','closed')),
  created_at timestamptz not null default now()
);

create table if not exists ur_ticket_messages (
  id         bigserial primary key,
  ticket_id  text not null references ur_tickets(id) on delete cascade,
  from_id    uuid not null references ur_profiles(id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);
create index if not exists ur_ticket_messages_idx on ur_ticket_messages(ticket_id, created_at);

-- ------------------------- payouts ------------------------------------
create table if not exists ur_payouts (
  id           text primary key,
  provider_id  uuid not null references ur_profiles(id) on delete cascade,
  amount       bigint not null check (amount > 0),
  status       text not null default 'pending' check (status in ('pending','paid')),
  requested_at timestamptz not null default now(),
  paid_at      timestamptz
);
create index if not exists ur_payouts_idx on ur_payouts(provider_id, requested_at desc);

-- ------------------------- audit log ----------------------------------
create table if not exists ur_audit_log (
  id         bigserial primary key,
  actor      text not null,
  action     text not null,
  created_at timestamptz not null default now()
);
create index if not exists ur_audit_idx on ur_audit_log(created_at desc);

-- ------------------------- settings (kv) ------------------------------
create table if not exists ur_settings (
  key   text primary key,
  value jsonb not null
);

-- =====================================================================
--  ROW LEVEL SECURITY
--  لا نضيف أي policy مقصودة: service_role فقط (من دالات Vercel) يتجاوز RLS.
--  معناه المفتاح العام (anon key) لا يقدر يقرأ ولا يكتب ولا صف واحد.
-- =====================================================================
alter table ur_counters        enable row level security;
alter table ur_categories      enable row level security;
alter table ur_services        enable row level security;
alter table ur_profiles        enable row level security;
alter table ur_providers       enable row level security;
alter table ur_orders          enable row level security;
alter table ur_reviews         enable row level security;
alter table ur_order_messages  enable row level security;
alter table ur_notifications   enable row level security;
alter table ur_tickets         enable row level security;
alter table ur_ticket_messages enable row level security;
alter table ur_payouts         enable row level security;
alter table ur_audit_log       enable row level security;
alter table ur_settings        enable row level security;

-- =====================================================================
--  SEED: الفئات + الخدمات (30) + الإعدادات
-- =====================================================================
insert into ur_categories(id,name,icon,sort) values
  ('cars','سيارات','🚗',1),
  ('home','صيانة منزلية','🔧',2),
  ('clean','نطافة','🧹',3),
  ('beauty','عناية وتجميل','💇',4),
  ('care','رعاية وتعليم','👶',5),
  ('events','مناسبات وسياحة','🎉',6),
  ('digital','تقنية وشبكات','📡',7),
  ('other','توصيل وأخرى','🛒',8)
on conflict (id) do update set name=excluded.name, icon=excluded.icon, sort=excluded.sort;

insert into ur_services(id,icon,name,cat,min_price,max_price,unit,popular,wave,sensitive,gold,description) values
 ('s1','🚗','غسيل سيارات متنقل','cars',12000,17000,'غسلة',true,1,false,false,'غسيل خارجي وداخلي عند باب دارك'),
 ('s2','❄️','صيانة تكييف وتبريد','home',20000,85000,'زيارة',true,1,false,false,'تنطيف، تعبئة غاز، إصلاح أعطال'),
 ('s3','🚿','سباكة منزلية','home',22000,60000,'زيارة',true,1,false,false,'تسريبات، مواسير، سخانات'),
 ('s4','💡','كهرباء منزلية','home',22000,60000,'زيارة',false,1,false,false,'أعطال كهربائية، توصيلات، لوحات'),
 ('s5','💇','كوافيرة منزلية (سيدات)','beauty',50000,300000,'جلسة',true,1,false,false,'قص، صبغ، تسريحات بخصوصية تامة'),
 ('s6','⚡','صيانة مولدات كهرباء','home',15000,350000,'زيارة',true,1,false,false,'أعطال مولدة البيت — خدمة نادرة بالعراق'),
 ('s7','💧','تنطيف خزانات مياه','clean',25000,35000,'خزان',false,1,false,false,'تنطيف وتعقيم دوري — ضرورة صحية'),
 ('s8','🧺','صيانة غسالات وثلاجات','home',20000,60000,'زيارة',false,2,false,false,'إصلاح أعطال الأجهزة المنزلية'),
 ('s9','🪚','نجارة منزلية','home',25000,100000,'مهمة',false,2,false,false,'أبواب، خزائن، تصليحات خشبية'),
 ('s10','🎨','دهان وديكور','home',30000,150000,'مهمة',false,2,false,false,'دهان جدران وأسقف'),
 ('s11','📹','تركيب ستالايت وكاميرات','digital',25000,80000,'تركيب',false,2,false,false,'ستالايت، كاميرات مراقبة، جرس ذكي'),
 ('s12','📱','صيانة موبايلات منزلية','digital',15000,60000,'إصلاح',false,2,false,false,'شاشات، بطاريات، أعطال برمجية'),
 ('s13','🏠','تنطيف منازل','clean',30000,80000,'جلسة',false,2,false,false,'تنطيف شامل أو دوري'),
 ('s14','🧶','غسيل سجاد منزلي','clean',20000,50000,'قطعة',false,2,false,false,'غسيل وتجفيف عند البيت'),
 ('s15','🪳','مكافحة حشرات','clean',30000,70000,'جلسة',false,2,false,false,'رش وتعقيم آمن'),
 ('s16','🔩','ميكانيكي سيارات متنقل','cars',25000,120000,'زيارة',false,2,false,false,'أعطال ميكانيكية عند موقعك'),
 ('s17','🔋','كهربائي سيارات متنقل','cars',20000,80000,'زيارة',false,2,false,false,'كهرباء السيارة، بطاريات، دينمو'),
 ('s18','🛢️','تبديل زيت بالبيت','cars',15000,30000,'خدمة',false,2,false,false,'تبديل زيت وفلاتر عند بابك'),
 ('s19','🛞','بنشر متنقل','cars',10000,25000,'إطار',false,2,false,false,'تصليح أو تبديل إطارات بالطريق'),
 ('s20','👶','حاضنة أطفال','care',150000,400000,'شهر',false,2,true,false,'بروتوكول توثيق صارم + مقابلة'),
 ('s21','👵','جليسة مسنين','care',100000,250000,'شهر',false,2,true,false,'رعاية منزلية ببروتوكول صارم'),
 ('s22','📚','مدرس خصوصي','care',20000,50000,'ساعة',false,2,false,false,'دروس منزلية لجميع المراحل'),
 ('s23','💈','حلاق منزل','beauty',10000,25000,'جلسة',false,2,false,false,'قص وحلاقة عند البيت'),
 ('s24','☕','قهوجي وضيافة مناسبات','events',100000,300000,'مناسبة',false,3,false,true,'عزائم وأعراس — خدمة ذهبية'),
 ('s25','👨‍🍳','طباخ ولائم منزلية','events',150000,500000,'وليمة',false,3,false,true,'طبخ ولائم المناسبات'),
 ('s26','🛶','مرشد سياحي: الأهوار وأور','events',50000,150000,'جولة',false,3,false,true,'جولات الأهوار وزقورة أور'),
 ('s27','🛒','مندوب تسوق من الأسواق','other',10000,25000,'مهمة',false,3,false,false,'جيب لي من سوق الناصرية'),
 ('s28','🧵','خياطة منزلية (سيدات)','beauty',15000,50000,'قطعة',false,3,false,false,'تفصيل وتعديل بخصوصية'),
 ('s29','💪','مدرب رياضي شخصي','care',25000,60000,'جلسة',false,3,false,false,'تدريب منزلي حسب هدفك'),
 ('s30','📡','فني شبكات وإنترنت','digital',15000,50000,'زيارة',false,3,false,false,'راوترات، تقوية تغطية، أعطال')
on conflict (id) do nothing;

insert into ur_settings(key,value) values
 ('commission','{"first":18,"standard":15,"loyal":13,"elite":10,"delivery":10}'::jsonb),
 ('thresholds','{"loyalAt":11,"eliteAt":31,"minPayout":10000}'::jsonb),
 ('areas','["الحبوبي","الحي العسكري","شارع 40","الإسكان","الزهراء","سومر","الشموخ","أور","الحي الصناعي","القادسية","7 نيسان","حي الحسين"]'::jsonb)
on conflict (key) do nothing;

-- العدّادات تُزرع تلقائياً أول طلب/تذكرة/تسوية (UR-1042 / T-1 / PO-1)

-- تم. حساب الإدارة يُنشأ تلقائياً من متغيرات ADMIN_PHONE / ADMIN_PASSWORD أول مرة يشتغل الـ API.
