import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// swift-endpoint — إنشاء حسابات الدخول وإرسال SMS عبر Msegat.
//
// v14 (2026-09-04):
//   • **سدّ ثغرة**: create-user و delete-user كانتا مفتوحتين لأي مستخدم موثّق
//     (verify_jwt يقبل مفتاح anon نفسه) — أي أن موظفاً عادياً يستطيع إنشاء
//     حساب أو حذفه. الآن كلاهما يتطلّب أن يكون المنادي **مديراً**.
//   • **provision-member**: يفتح الدخول لعضو **موجود** في team_members.
//     السبب: نموذج «إضافة موظف» يكتب في team_members فقط، فيبقى الموظف بلا
//     حساب، ودالة رمز الدخول تصمت أمام من لا حساب له — فيطلب الرمز ولا يصله
//     شيء ولا يعرف لماذا (بلاغ المستخدم 2026-09-04 عن المستشار رضوان).
//   • فرع SMS يبقى متاحاً لكل موظف موثّق (تقارير الجلسات والتذكيرات تستعمله).

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const admin = () =>
  createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

/** هل المنادي مديرٌ فعلاً؟ مفتاح anon وحده لا يكفي — لا بد من جلسة موظف مدير. */
async function callerIsDirector(req: Request): Promise<boolean> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return false;
  const sb = admin();
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return false;
  const { data: m } = await sb
    .from('team_members')
    .select('is_director')
    .eq('auth_id', data.user.id)
    .maybeSingle();
  return m?.is_director === true;
}

// يحلّ بيانات Msegat خادميّاً: Secrets أولاً ثم lookup_values (service role).
// لا تُقرأ من المتصفّح إطلاقاً.
async function resolveSmsCreds(): Promise<{ userName: string; apiKey: string; userSender: string } | null> {
  let userName = Deno.env.get('MSEGAT_USERNAME') ?? '';
  let apiKey = Deno.env.get('MSEGAT_API_KEY') ?? '';
  let userSender = Deno.env.get('MSEGAT_SENDER') ?? '';
  if (!userName || !apiKey || !userSender) {
    try {
      const { data } = await admin()
        .from('lookup_values')
        .select('value')
        .eq('type', 'sms_config')
        .maybeSingle();
      if (data?.value) {
        const cfg = JSON.parse(data.value as string);
        userName = userName || cfg.userName;
        apiKey = apiKey || cfg.apiKey;
        userSender = userSender || cfg.sender;
      }
    } catch (_) { /* تجاهل */ }
  }
  if (!userName || !apiKey || !userSender) return null;
  return { userName, apiKey, userSender };
}

function normPhone(raw: string): string {
  let n = (raw ?? '').replace(/\D/g, '');
  if (!n) return '';
  if (n.startsWith('00966')) n = n.slice(2);
  if (n.startsWith('0')) n = '966' + n.slice(1);
  else if (!n.startsWith('966')) n = '966' + n;
  return n;
}

async function sendSms(numbers: string, msg: string, name: string | null): Promise<boolean> {
  const creds = await resolveSmsCreds();
  if (!creds) return false;
  let ok = false;
  try {
    const res = await fetch('https://www.msegat.com/gw/sendsms.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...creds, numbers, msg, msgEncoding: 'UTF8' }),
    });
    const text = await res.text();
    ok = text.includes('M0000') || text.includes('"code":"1"') || text.includes('Success');
  } catch (_) { ok = false; }
  try {
    await admin().from('sms_log').insert({
      recipient_name: name ?? 'موظف',
      phone: numbers,
      message: msg,
      status: ok ? 'sent' : 'failed',
      sent_by: 'welcome',
    });
  } catch (_) { /* تجاهل */ }
  return ok;
}

/** كلمة مرور عشوائية: الدخول الأساسي برمز الجوال، وهذه لسدّ متطلّب الإنشاء فقط */
function randomPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return 'Rw' + Array.from(bytes).map((b) => b.toString(36)).join('').slice(0, 28) + '!7';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const action = body.action;

    /* ============ فتح الدخول لعضو موجود ============ */
    if (action === 'provision-member') {
      if (!(await callerIsDirector(req))) {
        return json({ error: 'هذا الإجراء للمدير فقط' }, 403);
      }
      const memberId = String(body.member_id ?? '');
      if (!memberId) return json({ error: 'member_id مطلوب' }, 400);

      const sb = admin();
      const { data: m, error: mErr } = await sb
        .from('team_members')
        .select('id, name, email, phone, auth_id, is_active')
        .eq('id', memberId)
        .maybeSingle();
      if (mErr || !m) return json({ error: 'الموظف غير موجود' }, 404);
      if (m.auth_id) return json({ success: true, already_provisioned: true });
      if (!m.email) {
        return json({ error: 'لا يمكن فتح الدخول بلا بريد إلكتروني — أضِفه في بيانات الموظف أولاً' }, 400);
      }

      // إنشاء حساب المصادقة — وإن كان البريد مسجّلاً سابقاً نربط الحساب القائم
      let authId: string | null = null;
      const { data: created, error: cErr } = await sb.auth.admin.createUser({
        email: m.email as string,
        password: randomPassword(),
        email_confirm: true,
      });
      if (created?.user) {
        authId = created.user.id;
      } else if (cErr && /already|exists|registered/i.test(cErr.message)) {
        const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const found = list?.users?.find(
          (u: { email?: string }) => (u.email ?? '').toLowerCase() === String(m.email).toLowerCase(),
        );
        authId = found?.id ?? null;
        if (!authId) return json({ error: `البريد مسجّل سابقاً وتعذّر إيجاد حسابه: ${cErr.message}` }, 400);
      } else {
        return json({ error: cErr?.message ?? 'تعذّر إنشاء حساب الدخول' }, 400);
      }

      const { error: linkErr } = await sb
        .from('team_members')
        .update({ auth_id: authId })
        .eq('id', memberId);
      if (linkErr) {
        // تراجع: لا نترك حساباً معلّقاً بلا صفّ مرتبط
        if (created?.user) await sb.auth.admin.deleteUser(created.user.id);
        return json({ error: `تعذّر ربط الحساب بالموظف: ${linkErr.message}` }, 400);
      }

      // رسالة ترحيب اختيارية — فشلها لا يُفشل فتح الدخول
      let welcomeSent = false;
      const numbers = normPhone(String(m.phone ?? ''));
      if (body.welcome !== false && numbers) {
        const { data: tpl } = await sb
          .from('message_templates')
          .select('body')
          .eq('key', 'staff_welcome')
          .maybeSingle();
        const msg = (tpl?.body as string | undefined)
          ? String(tpl!.body).replace(/\{name\}/g, String(m.name ?? ''))
          : `أهلاً بك ${m.name ?? ''}\nفُتح لك الدخول إلى نظام إدارة القضايا.\n` +
            `ادخل من app.redwan.sa واختر «رمز التحقق» ثم أدخل رقم جوالك — يصلك رمز من ٦ أرقام.\n` +
            `شركة عبدالرحمن بن رضوان المشيقح للمحاماة وإدارة إجراءات الإفلاس`;
        welcomeSent = await sendSms(numbers, msg, m.name as string | null);
      }

      return json({ success: true, auth_id: authId, welcome_sent: welcomeSent, has_phone: !!numbers });
    }

    /* ============ إنشاء موظف جديد بحسابه (من طلبات التوظيف) ============ */
    if (action === 'create-user' || action === 'create_user') {
      if (!(await callerIsDirector(req))) {
        return json({ error: 'هذا الإجراء للمدير فقط' }, 403);
      }
      const {
        email, password, name, role, short_name, avatar_initial, phone,
        date_of_birth, id_number, national_address, bank_name, bank_iban,
        qualifications, cv_url, qualification_doc_url, lawyer_license_url,
        emergency_contact_name, emergency_contact_phone, emergency_contact_relation
      } = body;

      if (!email || !password || !name) {
        return json({ error: 'بيانات ناقصة (email, password, name مطلوبة)' }, 400);
      }

      const supabaseAdmin = admin();
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (authError) return json({ error: authError.message }, 400);

      const tmPayload: Record<string, unknown> = {
        name,
        email,
        role: role || 'موظف',
        short_name: short_name || String(name).split(' ')[0],
        avatar_initial: avatar_initial || String(name)[0],
        phone: phone || null,
        auth_id: authData.user.id,
        is_active: true,
      };
      if (date_of_birth) tmPayload.date_of_birth = date_of_birth;
      if (id_number) tmPayload.id_number = id_number;
      if (national_address) tmPayload.national_address = national_address;
      if (bank_name) tmPayload.bank_name = bank_name;
      if (bank_iban) tmPayload.bank_iban = bank_iban;
      if (qualifications) tmPayload.qualifications = qualifications;
      if (cv_url) tmPayload.cv_url = cv_url;
      if (qualification_doc_url) tmPayload.qualification_doc_url = qualification_doc_url;
      if (lawyer_license_url) tmPayload.lawyer_license_url = lawyer_license_url;
      if (emergency_contact_name) tmPayload.emergency_contact_name = emergency_contact_name;
      if (emergency_contact_phone) tmPayload.emergency_contact_phone = emergency_contact_phone;
      if (emergency_contact_relation) tmPayload.emergency_contact_relation = emergency_contact_relation;

      const { data: tmData, error: tmError } = await supabaseAdmin
        .from('team_members')
        .insert(tmPayload)
        .select('id')
        .single();

      if (tmError) {
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
        return json({ error: tmError.message }, 400);
      }

      return json({ success: true, user_id: authData.user.id, team_member_id: tmData?.id });
    }

    /* ============ حذف حساب دخول ============ */
    if (action === 'delete-user' || action === 'delete_user') {
      if (!(await callerIsDirector(req))) {
        return json({ error: 'هذا الإجراء للمدير فقط' }, 403);
      }
      const { auth_id } = body;
      if (!auth_id) return json({ error: 'auth_id مطلوب' }, 400);

      const { error } = await admin().auth.admin.deleteUser(auth_id);
      if (error) return json({ error: error.message }, 400);
      return json({ success: true });
    }

    /* ============ إرسال SMS (لكل موظف موثّق) ============ */
    const { numbers, msg } = body;
    if (!numbers || !msg) {
      return json({ error: 'بيانات ناقصة (numbers, msg مطلوبة)' }, 400);
    }

    const resolved = await resolveSmsCreds();
    const userName = resolved?.userName || body.userName;
    const apiKey = resolved?.apiKey || body.apiKey;
    const userSender = resolved?.userSender || body.userSender;
    if (!userName || !apiKey || !userSender) {
      return json({ error: 'إعدادات الرسائل غير متوفرة' }, 400);
    }

    const res = await fetch('https://www.msegat.com/gw/sendsms.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userName, apiKey, userSender, numbers, msg, By: 'link', msgEncoding: 'UTF8',
      }),
    });

    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    const success = text.includes('M0000') || data?.code === '1' || data?.message === 'Success';

    return json({ ...data, code: success ? '1' : '0', raw: text });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
