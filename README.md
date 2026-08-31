# 🏛️ مدللني mdllni — منصة خدمات الناصرية

منصة حقيقية متكاملة (ليست وهمية) تربط الزبائن بمقدمي الخدمات في الناصرية / ذي قار.

- **الواجهة:** `index.html` (الهيكل) + `css/style.css` (التصميم) + `js/app.js` (منطق التطبيق) + `js/cloud.js` (طبقة السحابة) — HTML/CSS/JS مباشر بدون خطوة بناء.
- **الخادم:** دوال Vercel Serverless داخل مجلد `api/`.
- **قاعدة البيانات:** Supabase (PostgreSQL) — جداول حقيقية + RLS.
- **وضع مزدوج:** إذا لم تُضبط متغيرات Supabase تشتغل المنصة تلقائياً بوضع تجريبي محلي (localStorage) — مفيد للعرض.

---

## 🗄️ الجداول (14 جدول)
`ur_categories, ur_services, ur_profiles, ur_providers, ur_orders, ur_reviews, ur_order_messages, ur_notifications, ur_tickets, ur_ticket_messages, ur_payouts, ur_audit_log, ur_settings, ur_counters`

---

## 🚀 التشغيل خطوة بخطوة

### 1) Supabase
1. روح لـ https://supabase.com → أنشئ مشروع جديد (اختر Region قريب مثل Frankfurt).
2. من القائمة افتح **SQL Editor** → الصق كل محتوى `supabase/schema.sql` → **Run**.
3. رح تنزرع الجداول + 8 تصنيفات + 30 خدمة + الإعدادات.
4. من **Project Settings → API** انسخ:
   - `Project URL`  → يصير `SUPABASE_URL`
   - `service_role` secret → يصير `SUPABASE_SERVICE_ROLE_KEY` (سرّي جداً)

### 2) الرفع على Vercel
1. ارفع المجلد لـ GitHub ثم Import في Vercel (أو `vercel` من التيرمنال).
2. Framework Preset = **Other** (بدون بناء).
3. في **Settings → Environment Variables** حط المتغيرات (شوف `.env.example`):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `JWT_SECRET`  (نص عشوائي طويل — ولّده بـ `openssl rand -hex 32`)
   - `ADMIN_PHONE` (افتراضي 07800000000)
   - `ADMIN_PASSWORD` (غيّره!)
4. Deploy. خلاص.

### 3) دخول الإدارة
أول ما يشتغل الـ API يُنشأ حساب الإدارة تلقائياً من `ADMIN_PHONE` / `ADMIN_PASSWORD`.
ادخل من زر “دخول” بالرقم والباسورد.

---

## 🔌 الـ API
| المسار | الوظيفة |
|------|--------|
| `GET /api/health` | يقرّر الوضع (cloud/local) |
| `POST /api/auth` | `register` / `login` / `me` |
| `POST /api/data` | `snapshot` + كل العمليات (قبول طلب، تسعير، توثيق، تسوية…) |

الجلسات عبر JWT (HS256) + الباسوردات مشفّرة بـ scrypt على الخادم (مو بالمتصفّح).

---

## 🧪 اختبار محلي (بدون إنترنت)
```bash
node test-cloud.js
```
يشغّل دورة كاملة (تسجيل → توثيق → طلب → قبول → تنفيذ → تقييم → تسوية) على نفس كود الخادم مع قاعدة بيانات في الذاكرة.

---

## 🔐 أمان
- **دوّر توكن Vercel** اللي نشرته بالمحادثة (اعتبره مكشوف). Account Settings → Tokens → احذف القديم → أنشئ جديد.
- `service_role` و`JWT_SECRET` يبقون بالـ Environment Variables فقط — لا تحطهم بالكود.
- كل الجداول RLS مفعّل (الوصول فقط عبر service_role من الخادم).
