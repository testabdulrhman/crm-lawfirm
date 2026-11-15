-- بلاغ المدير 2026-11-15 «أنشئت جلسة وطلع لي تعذّر إنشاء مهمة»:
-- (١) مهام «المطلوب منا» تُحفظ من المتصفح بـupsert on_conflict=derived_key، والفهرس كان جزئياً
--     (where derived_key is not null) فلا يُستنتج ⇒ 42P10 دائماً. الفهرس الكامل يكافئه (NULL لا يتعارض).
create unique index if not exists tasks_derived_key_uniq on public.tasks (derived_key);
drop index if exists public.tasks_derived_key_unique;

-- (٢) close_session كانت تُدرج الجلسة القادمة دائماً — ولو كانت جلسة ذلك اليوم مسجّلة مسبقاً
--     ⇒ جلستان بالتاريخ نفسه. الآن تُستعمل الجلسة المفتوحة الموجودة في التاريخ نفسه إن وُجدت.
CREATE OR REPLACE FUNCTION public.close_session(p_session_id uuid, p_outcome text, p_minutes_url text DEFAULT NULL::text, p_next_action text DEFAULT 'none'::text, p_next_session_date date DEFAULT NULL::date, p_next_session_time time without time zone DEFAULT NULL::time without time zone, p_ruling_due_date date DEFAULT NULL::date)
 RETURNS json
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_case_id uuid;
  v_court text;
  v_assignee_id uuid;
  v_new_session_id uuid;
  v_next_num int;
  v_result json;
BEGIN
  SELECT case_id, court INTO v_case_id, v_court FROM sessions WHERE id = p_session_id;
  SELECT assignee_id INTO v_assignee_id FROM cases WHERE id = v_case_id;

  UPDATE sessions
  SET outcome = p_outcome,
      minutes_url = COALESCE(p_minutes_url, minutes_url),
      status = 'held',
      closed_at = now(),
      next_action = p_next_action,
      ruling_due_date = CASE WHEN p_next_action='await_ruling' THEN p_ruling_due_date ELSE NULL END
  WHERE id = p_session_id;

  IF p_next_action = 'next_session' AND p_next_session_date IS NOT NULL THEN
    -- جلسة مفتوحة مسجّلة في التاريخ نفسه؟ تُربط هي ولا تُكرَّر
    SELECT id INTO v_new_session_id FROM sessions
     WHERE case_id = v_case_id AND session_date = p_next_session_date
       AND id <> p_session_id AND closed_at IS NULL
     ORDER BY created_at LIMIT 1;

    IF v_new_session_id IS NULL THEN
      SELECT COALESCE(count(*),0) + 1 INTO v_next_num FROM sessions WHERE case_id = v_case_id;
      INSERT INTO sessions (case_id, title, session_date, session_time, court, status)
      VALUES (v_case_id,
              'جلسة رقم ' || lpad(v_next_num::text, 2, '0'),
              p_next_session_date, p_next_session_time, v_court, 'upcoming')
      RETURNING id INTO v_new_session_id;
    ELSIF p_next_session_time IS NOT NULL THEN
      UPDATE sessions SET session_time = COALESCE(session_time, p_next_session_time) WHERE id = v_new_session_id;
    END IF;

    UPDATE sessions SET next_session_id = v_new_session_id WHERE id = p_session_id;
  END IF;

  IF p_next_action = 'await_ruling' AND p_ruling_due_date IS NOT NULL THEN
    INSERT INTO tasks (case_id, title, status, due_date, priority, task_type, assignee_id)
    VALUES (v_case_id, 'استلام الحكم', 'todo', p_ruling_due_date, 'high', 'ruling', v_assignee_id);
  END IF;

  IF p_next_action = 'case_closed' THEN
    UPDATE cases SET status = 'muntahia' WHERE id = v_case_id;
  END IF;

  SELECT json_build_object(
    'session_id', p_session_id,
    'case_id', v_case_id,
    'new_session_id', v_new_session_id,
    'client_name', ct.name,
    'client_phone', ct.phone,
    'case_title', c.title
  ) INTO v_result
  FROM cases c LEFT JOIN contacts ct ON ct.id = c.contact_id
  WHERE c.id = v_case_id;

  RETURN v_result;
END;
$function$;
