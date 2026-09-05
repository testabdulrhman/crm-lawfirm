# RUNBOOK — نظام إدارة المكتب

دليل التشغيل والنشر والتعافي. **لا أسرار في هذا الملف** — أسماء المتغيّرات فقط،
وقيمها في لوحات Netlify وSupabase.

المشروع: شركة عبدالرحمن بن رضوان المشيقح للمحاماة وإدارة إجراءات الإفلاس.
مكوّناته ثلاثة: واجهة ويب (React/Vite على Netlify) · قاعدة ودوال (Supabase) ·
تطبيق iOS أصيل (SwiftUI على App Store).

---

## ١. المعرّفات

| | القيمة |
|---|---|
| مستودع الشيفرة | `testabdulrhman/crm-lawfirm` — الفرع `main` هو الإنتاج |
| موقع الويب | https://app.redwan.sa (Netlify) |
| مشروع Supabase | `zwaahunavepleczuamuy` · منطقة `eu-west-1` · Postgres 17 |
| لوحة Supabase | https://supabase.com/dashboard/project/zwaahunavepleczuamuy |
| تطبيق iOS | App Store id `6803916623` · حزمة `sa.redwan.app` · فريق `89HBK8SMZU` |
| رابط التطبيق | https://apps.apple.com/app/redwan/id6803916623 (غير مُدرج — الرابط وحده وسيلة التوزيع) |

⚠️ حساب GitHub وحساب Netlify **مختلفان** — لا تفترض أن الدخول لأحدهما يكفي للآخر.

---

## ٢. البناء والنشر

### الويب

```bash
npm ci
npm run lint     # tsc --noEmit — فحص الأنواع
npm run build    # tsc -b && vite build → dist/
```

النشر **تلقائي**: كل دفعة إلى `main` تبني وتنشر على Netlify
(`netlify.toml`: الأمر `npm run build`، المجلد `dist`، Node 20).

> **قاعدة ملزمة**: لا تدفع قبل بناء أخضر. و`npm run build | tail` يخفي رمز
> الخروج — استعمل `set -o pipefail` أو افحص `$?` منفصلاً.

**متغيّرات البيئة** (في Netlify → Site settings → Environment variables):

| المتغيّر | الوصف |
|---|---|
| `VITE_SUPABASE_URL` | عنوان مشروع Supabase |
| `VITE_SUPABASE_ANON_KEY` | المفتاح العام — **عام بطبيعته**، الأمان كله في سياسات RLS |

⚠️ **لا يوضع مفتاح service_role في الويب إطلاقاً** — مكانه أسرار دوال Supabase فقط.

### دوال Supabase (Edge Functions)

```bash
npx supabase functions deploy <اسم-الدالة> --project-ref zwaahunavepleczuamuy
```

النشر **ليس تلقائياً** مع دفعات git — كل دالة تُنشر بأمرها. نسخة كل دالة
محفوظة في `supabase/functions/<الاسم>/index.ts` للمراجعة والتأريخ.

**أسرار الدوال** (لوحة Supabase → Edge Functions → Secrets):
`ANTHROPIC_API_KEY` · `MSEGAT_USERNAME` · `MSEGAT_API_KEY` · `MSEGAT_SENDER` ·
`HATIF_CLIENT_ID` · `HATIF_CLIENT_SECRET` · `HATIF_CHANNEL_ID` ·
`GOOGLE_CLIENT_ID` · `GOOGLE_CLIENT_SECRET` · `GOOGLE_REFRESH_TOKEN` ·
`GOOGLE_CALENDAR_ID` · (و`SUPABASE_URL` و`SUPABASE_SERVICE_ROLE_KEY` تُحقنان تلقائياً)

**إعدادات قابلة للتحرير من الواجهة** تعيش في جدول `lookup_values` لا في الأسرار
(نمط SaaS): `sms_config` · `whatsapp_config` · `gmail_config` · `push_config` ·
`booking_config` · `ai_config` · `discussion_ai_config` · `doc_ai_config` ·
`najiz_ai_config` · `sms_inbox_config` · `task_derivation_config` ·
`appt_confirm_config` · `tv_board_config` · `integration_config`.

### ترحيلات القاعدة

ملفات `supabase/migrations/*.sql` سجلٌّ تأريخي. التطبيق على الإنتاج يتم بتنفيذ
الترحيل مباشرة على القاعدة (لوحة Supabase → SQL Editor، أو عبر MCP).
**لا تُغيَّر البنية إلا بطلب صريح.**

### تطبيق iOS

انظر `ios-native/tools/README.md`. باختصار: ارفع `MARKETING_VERSION` و
`CURRENT_PROJECT_VERSION` في `project.pbxproj` → `xcodebuild archive` →
**افحص الأرشيف بـ`strings` للتأكد أن تغييراتك داخله** → `-exportArchive` للرفع →
`node ios-native/tools/submit.mjs <النسخة> <البناء> "<ما الجديد>"`.
المفتاح الخاص في `~/.asc/AuthKey_R7MPB9GF3A.p8` (خارج المستودع).

---

## ٣. التراجع (Rollback)

### الويب — الأسرع والأضمن

1. افتح Netlify → **Deploys**.
2. اختر آخر نشرة كانت سليمة.
3. **Publish deploy** → تعود الحال خلال ثوانٍ بلا بناء.

ثم أصلح الشيفرة وادفع من جديد. (البديل الأبطأ: `git revert <sha>` ثم دفع،
فيُعيد Netlify البناء.)

### دالة Supabase

النسخ السابقة **لا تُستعاد من اللوحة**. الطريق:

```bash
git log --oneline -- supabase/functions/<الاسم>/index.ts
git checkout <sha> -- supabase/functions/<الاسم>/index.ts
npx supabase functions deploy <الاسم> --project-ref zwaahunavepleczuamuy
```

لهذا السبب تُحفظ نسخة كل دالة في المستودع — بدونها لا تراجع.

### ترحيل قاعدة

لا تراجع تلقائياً. اكتب ترحيلاً عكسياً واختبره على نسخة مستعادة أولاً
(انظر §٤). وللتغييرات الهدّامة: خذ نسخة يدوية قبلها مباشرةً.

### تطبيق iOS

لا يمكن سحب نسخة منشورة. الحل: **Remove from Sale** مؤقتاً من App Store
Connect، أو رفع نسخة إصلاح جديدة (المراجعة أخذت في تجاربنا ساعات لا أياماً).

---

## ٤. النسخ الاحتياطية والتعافي

**الحجم اليوم** (2026-09-04): قاعدة **56 م.ب** · تخزين **≈٧٠٠ م.ب** في ١٤٤٨ ملفاً.

⚠️ **الخطر الأهم**: `pg_dump` ينسخ القاعدة **ولا ينسخ ملفات التخزين**. مستندات
المكتب (أحكام، وكالات، عقود) في Storage لا في الجداول — فالنسخة التي تغفلها
ليست نسخة للمكتب.

### النسخة الكاملة = شقّان

```bash
# ١) القاعدة — سلسلة الاتصال من: لوحة Supabase ← Settings ← Database
pg_dump "postgresql://postgres:<كلمة-المرور>@db.zwaahunavepleczuamuy.supabase.co:5432/postgres" \
  --no-owner --no-privileges -Fc -f "crm-$(date +%F).dump"

# ٢) الملفات — مزامنة دلاء التخزين
#    تحتاج rclone مضبوطاً على S3 المتوافق في Supabase Storage
rclone sync supabase:documents /volume1/backups/crm/documents
rclone sync supabase:avatars   /volume1/backups/crm/avatars
```

**أين تُخزَّن**: خارج Supabase — على Synology أو أي جهاز تملكه. نسخة داخل
المزوّد لا تحميك من ضياع الحساب أو حذف بالخطأ.

**الاحتفاظ المقترح**: يومية تُحفظ ١٤ يوماً، وأسبوعية تُحفظ ٣ أشهر.

### الاستعادة — والاختبار الذي يجعل النسخة نسخة

```bash
# على قاعدة اختبار منفصلة (مشروع Supabase آخر أو Postgres محلي)
createdb crm_restore_test
pg_restore --no-owner --no-privileges -d crm_restore_test "crm-YYYY-MM-DD.dump"
```

ثم تحقّق: عدد القضايا والمستندات وجهات الاتصال يطابق الإنتاج، وافتح ملفاً
وتأكّد أن مرفقاته موجودة في نسخة التخزين.

> **نسخة لم تُختبر استعادتها ليست نسخة.** اختبرها مرة عند الإنشاء، ثم كل ربع سنة.

### ما يوفّره Supabase نفسه

المشروع على خطة مدفوعة، ولها نسخ يومية تلقائية داخل المنصّة. **لا تكفي وحدها**:
فهي عند المزوّد نفسه، ولا تشمل Storage، وتضيع بضياع الحساب. اعتبرها الطبقة
الأولى، والنسخة التي تملكها هي الطبقة التي تنقذ فعلاً.

---

## ٥. المهامّ المجدولة (pg_cron)

تعمل داخل القاعدة وتنادي الدوال عبر `pg_net`. أبرزها: تذكيرات الجلسات،
ملخّصات ما قبل الجلسة (٠٣:٠٠ UTC)، تجديد الدراسات القديمة (٠١:٠٠ UTC)،
سلّم المهل النظامية، مزامنة التقويم والبريد.

```sql
select jobname, schedule, active from cron.job order by jobname;
select * from cron.job_run_details order by start_time desc limit 20;  -- التشخيص
```

⚠️ **pg_cron لا يقلّم سجلّه**. مهمة `cron-log-retention` (يومياً ٠٢:١٥ UTC) تحذف
ما مضى عليه ٧ أيام. بدونها بلغ `cron.job_run_details` ١٥ م.ب في شهرين وأنهك
رصيد الإدخال/الإخراج على حوسبة nano. وكذلك `net._http_response` ينتفخ ولا
يستعيد مساحته — عند تنبيه IO افحص حجم الجدولين أولاً:

```sql
select pg_size_pretty(pg_total_relation_size('cron.job_run_details')),
       pg_size_pretty(pg_total_relation_size('net._http_response'));
-- العلاج: delete القديم ثم vacuum full (قفل حصري، ثوانٍ على هذا الحجم)
```

---

## ٦. عند العطل — من أين تبدأ

| العَرَض | افحص |
|---|---|
| الموقع لا يفتح | لوحة Netlify → آخر نشرة: هل فشل البناء؟ |
| الموقع يفتح والبيانات لا تظهر | حالة مشروع Supabase؛ ثم سياسات RLS للجدول المعني |
| موظف لا يصله رمز الدخول | له `auth_id`؟ صفحة الموظف تُظهر «بلا حساب دخول» وزر فتحه |
| رسالة/واتساب لا تصل | `sms_log` — الحالة والسبب؛ ونافذة الـ٢٤ ساعة في واتساب |
| ميزة ذكاء متوقفة | رصيد Anthropic أولاً، ثم `error_logs`، ثم سجل الدالة في اللوحة |
| مهمة مجدولة لم تعمل | `cron.job_run_details` ثم `net._http_response` |

سجلّات الدوال: لوحة Supabase → Edge Functions → الدالة → Logs.
