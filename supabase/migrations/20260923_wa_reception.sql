-- =============================================================
-- مكتب الاستقبال على الواتساب — انتقل من redwan-hub إلى المحاماة (قرار المدير 2026-09-23):
-- «الـ Hub لا يكتب ردوداً أبداً؛ كل نظام يرد عن نفسه كما يفعل crm-iflas».
--
-- الـ Hub يمرّر الحدث المنسّق (الرقم والهوية جاهزان) إلى الدالة wa-reception،
-- وهي تحفظ هنا حالة المحادثة ووارِدها وصادرها، ثم ترد عبر send-message في الـ Hub.
-- جدولان جديدان — لا يُمس جدولٌ قائم. للخدمة وحدها: RLS بلا سياسات.
-- =============================================================

create table if not exists public.wa_reception_conversations (
  phone_e164          text primary key,
  hub_conversation_id text,
  state               text not null default 'new'
                      check (state in ('new','awaiting_system','bound','intake','intake_done')),
  assigned_system     text check (assigned_system in ('law','bankruptcy')),
  bound_external_id   text,
  bind_expires_at     timestamptz,
  choice_options      jsonb,
  choice_attempts     int not null default 0,
  intake_step         text,
  intake_data         jsonb not null default '{}'::jsonb,
  intake_updated_at   timestamptz,
  pending             jsonb,
  tags                text[] not null default '{}',
  notices             jsonb not null default '{}'::jsonb,
  last_greeting_at    timestamptz,
  ooh_notice_at       timestamptz,
  version             int not null default 0,     -- قفل تفاؤلي: رسالتان متزامنتان لا تتسابقان
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists public.wa_reception_messages (
  id          bigserial primary key,
  phone_e164  text not null,
  event_ref   text unique,                          -- مرجع حدث الـ Hub: منع التكرار
  direction   text not null check (direction in ('in','out')),
  body        text,
  media       jsonb not null default '[]'::jsonb,
  media_label text,
  superseded  boolean not null default false,       -- دخل في دفعةٍ قرّر عليها وارد أحدث
  decision    jsonb,                                -- ما قرّره المنطق (للمراجعة)
  created_at  timestamptz not null default now()
);
create index if not exists wa_reception_messages_phone_idx
  on public.wa_reception_messages (phone_e164, created_at);

alter table public.wa_reception_conversations enable row level security;
alter table public.wa_reception_messages      enable row level security;
revoke all on public.wa_reception_conversations from anon, authenticated;
revoke all on public.wa_reception_messages      from anon, authenticated;
