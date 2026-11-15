-- المراجعة الشاملة 2026-11-15، الدفعة الثالثة: التوقيع من النقاش (الويب SignAttachment والآيفون SignDocument)
-- كان يكتب ثلاث كتابات بعد رفع النسخة الموقّعة ويتجاهل أخطاءها: إن تعثّرت الشبكة ظهر «سُجّل في الصادر»
-- والصادر يشير للنسخة غير الموقّعة، ولا اعتماد مسجّل، وطلب التوقيع معلّق فيُطلب مرة أخرى.
-- الآن نداء واحد ذرّي (الكل أو لا شيء)، وآمن للإعادة (الاعتماد upsert على letter_id).
-- security invoker: الكتابة بصلاحيات الموقّع نفسها كما كانت من المتصفح.
create or replace function public.finalize_signature(
  p_letter_id uuid,
  p_request_id uuid,
  p_signed_url text,
  p_document_id uuid,
  p_approval jsonb default null
) returns void
language plpgsql
set search_path = public
as $$
declare
  a jsonb := coalesce(p_approval, '{}'::jsonb);
begin
  if p_letter_id is not null then
    update outgoing_letters set file_url = p_signed_url, document_id = p_document_id where id = p_letter_id;
    if not found then
      raise exception 'الخطاب غير موجود أو لا صلاحية لتعديله';
    end if;

    insert into outgoing_approvals (
      letter_id, status, original_file_url, signed_file_url, requested_by, requested_at,
      approved_by, approved_at, apply_mode, stamp_page, stamp_x, stamp_y, sig_pos, extra_sigs, note
    ) values (
      p_letter_id, 'approved', a->>'original_file_url', p_signed_url,
      nullif(a->>'requested_by', '')::uuid, coalesce(nullif(a->>'requested_at', '')::timestamptz, now()),
      public.my_member_id(), now(),
      coalesce(a->>'apply_mode', 'stamp'),
      nullif(a->>'stamp_page', '')::int, nullif(a->>'stamp_x', '')::real, nullif(a->>'stamp_y', '')::real,
      case when jsonb_typeof(a->'sig_pos') = 'object' then a->'sig_pos' end,
      case when jsonb_typeof(a->'extra_sigs') = 'array' then a->'extra_sigs' end,
      a->>'note'
    )
    on conflict (letter_id) do update set
      status = 'approved', signed_file_url = excluded.signed_file_url,
      approved_by = excluded.approved_by, approved_at = excluded.approved_at,
      apply_mode = excluded.apply_mode, stamp_page = excluded.stamp_page,
      stamp_x = excluded.stamp_x, stamp_y = excluded.stamp_y,
      sig_pos = excluded.sig_pos, extra_sigs = excluded.extra_sigs;
  end if;

  if p_request_id is not null then
    update sign_requests
       set status = 'signed', letter_id = coalesce(p_letter_id, letter_id), signed_at = now()
     where id = p_request_id;
  end if;
end $$;

revoke all on function public.finalize_signature(uuid, uuid, text, uuid, jsonb) from public, anon;
grant execute on function public.finalize_signature(uuid, uuid, text, uuid, jsonb) to authenticated;
