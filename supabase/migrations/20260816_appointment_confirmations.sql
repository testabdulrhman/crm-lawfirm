-- تأكيد الموعد تلقائياً حسب نوعه: حضوري ← رابط موقع المكتب · عن بُعد ← رابط اجتماع
-- 2026-08-16
--
-- السبب: الموكّل لا يصله شيء اليوم عند الحجز (٦ من ١٤ موعداً فقط أُرسل لها
-- تأكيد يدوياً)، والرقم المرجعي APT-26xxx لا يراه أحد.
--
-- قرار المستخدم: التأكيد يُرسل **فوراً** عند الحجز، ورابط الاجتماع للحجز
-- «عن بُعد» يُجهَّز لاحقاً ويُرسل برسالة ثانية.

begin;

/* ============ ١. رابط اجتماع لكل موعد عن بُعد ============ */

alter table public.appointments
  add column if not exists meeting_link      text,
  add column if not exists meeting_link_sent_at timestamptz;

comment on column public.appointments.meeting_link is
  'رابط الاجتماع المباشر (للمواعيد عن بُعد) — يُجهَّز بعد الحجز ويُرسل برسالة مستقلة';

/* ============ ٢. رابط موقع المكتب (للحجز الحضوري) ============ */

alter table public.office_info
  add column if not exists location_url text;

comment on column public.office_info.location_url is
  'رابط خرائط موقع المكتب — يُرسل مع تأكيد المواعيد الحضورية';

/* ============ ٣. قوالب الرسائل الثلاثة ============ */
-- تُحرَّر من الإعدادات ← قوالب الرسائل. المتغيرات:
-- {name} {date} {time} {reference} {location} {link}

insert into public.message_templates (key, name, category, description, variables, is_active, body)
values
  ('appt_confirm_onsite',
   'تأكيد موعد — حضوري',
   'appointments',
   'يُرسل تلقائياً فور الحجز عندما تكون طريقة الاجتماع «حضوري»',
   '["name","date","time","reference","location"]'::jsonb,
   true,
   'مرحباً {name}
تم تأكيد موعدكم في شركة عبدالرحمن بن رضوان المشيقح للمحاماة وإدارة إجراءات الإفلاس

📅 التاريخ: {date}
🕐 الوقت: {time}
📍 حضوري في مقر المكتب:
{location}

الرقم المرجعي: {reference}'),

  ('appt_confirm_remote',
   'تأكيد موعد — عن بُعد',
   'appointments',
   'يُرسل تلقائياً فور الحجز عندما تكون طريقة الاجتماع «عن بُعد»',
   '["name","date","time","reference"]'::jsonb,
   true,
   'مرحباً {name}
تم تأكيد موعدكم في شركة عبدالرحمن بن رضوان المشيقح للمحاماة وإدارة إجراءات الإفلاس

📅 التاريخ: {date}
🕐 الوقت: {time}
💻 اجتماع عن بُعد — يصلكم رابط الاجتماع قبل الموعد

الرقم المرجعي: {reference}'),

  ('appt_meeting_link',
   'رابط الاجتماع عن بُعد',
   'appointments',
   'يُرسل يدوياً بعد تجهيز رابط الاجتماع للموعد عن بُعد',
   '["name","date","time","reference","link"]'::jsonb,
   true,
   'مرحباً {name}
رابط اجتماعكم مع شركة عبدالرحمن بن رضوان المشيقح للمحاماة وإدارة إجراءات الإفلاس

📅 {date} الساعة {time}
🔗 {link}

الرقم المرجعي: {reference}')
on conflict (key) do nothing;

commit;
