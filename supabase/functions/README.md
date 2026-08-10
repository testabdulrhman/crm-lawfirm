# دوال Supabase (Edge Functions)

مصادر الدوال المنشورة على مشروع `zwaahunavepleczuamuy`.

## ⚠️ المصدر الحقيقي هو Supabase لا هذا المجلد

الدوال تُنشر عبر MCP لا من هذا المجلد، فلا يوجد ما يضمن التطابق تلقائياً.
**كل تعديل يجب أن يُكتب هنا ويُنشر في نفس الخطوة.** قبل تعديل أي دالة، اجلب
النسخة المنشورة وقارنها بالملف المحلي — لا تفترض أن المحلي محدّث.

للتحقق من التطابق: أعد نشر الملف المحلي كما هو، فإن جاء `ezbr_sha256` مطابقاً
للنسخة السابقة فالملفان متطابقان بايتاً ببايت.

## المحفوظة هنا

| الدالة | الغرض | verify_jwt |
|---|---|---|
| `ai-assistant` | البوابة الموحّدة للذكاء الاصطناعي: المساعد الذكي (وكيل بأدوات)، تحليل المتقدمين، استخراج الأحكام والمحاضر، الصياغة والتلخيص | ✓ |
| `booking` | حجز المواعيد العام — يخدم `redwan.sa/appointments` عبر وسيط Netlify | ✓ |
| `extract-minutes` | استخراج بيانات محضر الجلسة — زر «تعبئة تلقائية من المحضر» | ✓ |
| `session-reminders` | تذكير المحامين بالجلسات — **رسائل نصية** (Msegat) منذ v3 | ✓ |

## ⚠️ دوال منشورة وغير محفوظة هنا

هذه تعيش في Supabase وحدها — لا نسخة محلية للرجوع إليها:

`swift-endpoint` · `calendar-sync` · `submit-application` · `case-study` ·
`email-send` · `email-sync` · `email-attach` · `sms-inbox` ·
`whatsapp-send` · `whatsapp-webhook` · `staff-login-otp` · `hatif-webhook` ·
`hatif-sync` · `hatif-bulk-sync` · `wa-inbox` · و`wa-*-temp` (مؤقتة)

نقلها يتم بجلبها من Supabase وكتابتها هنا. غير مستعجل، لكنه دَين قائم.

## ⚠️ فخّان معروفان

**١. `deploy_edge_function` عبر MCP يقلب `verify_jwt` إلى `true` دائماً** ولا خيار
في الأداة. الدوال العامة `hatif-webhook` و`hatif-bulk-sync` و`staff-login-otp`
و`whatsapp-webhook` و`wa-inbox` ما زالت `false` —
**إعادة نشرها عبر MCP ستكسر مستدعييها الخارجيين.**
`session-reminders` صارت `true` في 2026-08-10، وحُدّثت مهمتا cron لترسلا ترويسة
`Authorization` بمفتاح anon **قبل** النشر. أي دالة تستدعيها cron: عدّل المهمة أولاً.

**٣. `revoke ... from public` لا يكفي في Supabase** — المنصّة تمنح الصلاحية
صراحةً لدورَي `anon` و`authenticated`، فيبقيان قادرَين. سمِّ الدورين في الإلغاء.
(كشفت مراجعة 2026-08-10 ثلاث ثغرات سببها هذا — انظر migration `20260810_security_lockdown`.)

**٢. سقف `max_tokens` يشمل التفكير الداخلي للنموذج.** سقف 2000 كان يُستهلك
~1930 منه في التفكير فيُقطع الجواب ويفشل تحليل الـJSON بصمت (أُصلح في v22).
أي مهمة تُرجع JSON تحتاج سقفاً واسعاً ومحلّلاً متسامحاً ورسالة خطأ صريحة.

## الأسرار

تُقرأ من Supabase Secrets ولا تُكتب في الكود إطلاقاً:
`ANTHROPIC_API_KEY` · `MSEGAT_USERNAME/API_KEY/SENDER` ·
`GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN` · `GOOGLE_CALENDAR_ID` ·
`EVOLUTION_API_URL/INSTANCE/API_KEY` · `HATIF_WEBHOOK_SECRET`
