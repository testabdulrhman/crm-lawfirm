-- قوالب متعددة القنوات: القالب الواحد له نص نصية (body القائم) ونص واتساب
-- ونص بريد + موضوعه. الفراغ = وراثة نص النصية، فلا يلزم تعبئة الثلاثة.
alter table message_templates
  add column if not exists body_whatsapp text,
  add column if not exists body_email text,
  add column if not exists email_subject text;

comment on column message_templates.body_whatsapp is 'نص قناة الواتساب — فارغ يرث body';
comment on column message_templates.body_email is 'نص قناة البريد الإلكتروني — فارغ يرث body';
comment on column message_templates.email_subject is 'موضوع رسالة البريد — فارغ يستخدم اسم القالب';
