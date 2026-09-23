# whatsapp-webhook — الإصدار v9 (مؤرشف)

هذا نصّ الدالة **كما كان منشوراً** على crm-lawfirm (الإصدار 9) قبل حذفها في 2026-09-23،
منزّلاً من Supabase مباشرة (`supabase functions download`)، لا من نسخة المستودع السابقة
(والفرق بينهما طريقة كتابة تعبير نمطي واحد لا غير).

## لماذا حُذفت
- رابطها كان يُحمى بسرٍّ في الاستعلام (`?secret=`) انكشف سابقاً.
- انتقل استقبال الواتساب كله إلى redwan-hub، ثم انتقل الرد على المحاماة إلى
  `supabase/functions/wa-reception` (قرار المدير 2026-09-23: كل نظام يرد عن نفسه).
- حُذف معها صفّ السرّ من `lookup_values` (type=`whatsapp_config`, label=`webhook_secret`).

## ما انتقل منها وأين
| في v9 | الآن |
|---|---|
| ردّ التحية وسعر الساعة وعرض الحجز | `wa-reception/flow.ts` (منطق «الرقم الجديد») |
| قراءة سعر الساعة من `lookup_values` | `wa-reception/index.ts` محلياً |
| التحقق بـ `?secret=` | توقيع HMAC من الـ Hub (`x-hub-signature`) |

المجلد خارج `supabase/functions` عمداً: لا يُنشر بالخطأ مع `functions deploy`.
