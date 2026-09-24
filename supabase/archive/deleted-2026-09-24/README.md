# دوال حُذفت من Supabase في 2026-09-24

حُذفت بطلب المدير (رسالة التنظيف)، ولم يكن كودها في المستودع، فحُفظ هنا كما كان منشوراً.
ولم يكن لأيٍّ منها مستدعٍ في الواجهة ولا في الدوال ولا في المهام المجدولة.

| الدالة | ما كانت تفعله |
|---|---|
| `hatif-webhook` | تستقبل أحداث المكالمات من هاتف إلى `hatif_calls`. حلّ محلها `comms-router` في redwan-hub مع `hub_ingest` (kind=call)، ولا صفوف فيها منذ 2026-05-11 |
| `ai-test` | تشخيص مؤقت، مُعطّلة من قبل |
| `wa-inspect-temp`، `wa-probe-temp`، `wa-diag-temp`، `wa-tpl-probe` | فحوص لمرة واحدة، مُعطّلة من قبل |
| `wa-import-temp`، `wa-media-backfill-temp` | استيراد أرشيف Evolution ووسائطه لمرة واحدة، مُعطّلتان من قبل |

**الرجوع:** `npx supabase functions deploy <name> --project-ref zwaahunavepleczuamuy` من نسخةٍ هنا
تُنقل إلى `supabase/functions/<name>/`، مع `--no-verify-jwt` لـ `hatif-webhook` وحدها.
