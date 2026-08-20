// تصنيف المستندات بالذكاء (طلب المستخدم 2026-08-22: «ترفع ملفاً فيقترح
// نوعه وملفه») — تُستدعى من trigger على إدراج documents عبر pg_net.
//
// تقرأ الملف (PDF/صورة) وتكتب في صفّه: category + وصفاً موجزاً، ولو كان
// بلا ملف رجّحت ملفه من قائمة الملفات النشطة (suggested_case_id) وردّت
// في خيط رسالته في النقاش إن وُجدت. نفس حراسة discussion-ai: سر داخلي،
// والتصنيف يحدث مرة واحدة (category موجود = تخطٍّ).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-5"; // مستندات قانونية عربية — الدقة تسبق الكلفة

const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const CATEGORIES = [
  "حكم قضائي",
  "لائحة / مذكرة",
  "وكالة",
  "عقد",
  "صك",
  "هوية / سجل",
  "خطاب",
  "فاتورة / سند",
  "تقرير",
  "محضر جلسة",
  "أخرى",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({});
  try {
    if (!ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY غير مضبوط" }, 500);

    // بوابة السر الداخلي — نفس سر ذكاء النقاش
    const { data: secretRow } = await admin
      .from("lookup_values").select("value")
      .eq("type", "discussion_ai_config").eq("label", "inbound_secret")
      .limit(1).maybeSingle();
    if (!secretRow?.value || req.headers.get("x-ai-secret") !== secretRow.value) {
      return json({ error: "forbidden" }, 403);
    }

    const { document_id } = await req.json().catch(() => ({}));
    if (!document_id) return json({ skipped: "document_id مفقود" });

    const { data: doc } = await admin
      .from("documents")
      .select("id, case_id, name, file_path, file_type, file_size, description, category")
      .eq("id", document_id)
      .maybeSingle();
    if (!doc) return json({ skipped: "مستند غير موجود" });
    if (doc.category) return json({ skipped: "مصنَّف مسبقاً" });
    if (!doc.file_path) return json({ skipped: "بلا مسار تخزين" });

    // ===== تنزيل الملف =====
    const dl = await admin.storage.from("documents").download(doc.file_path);
    if (dl.error || !dl.data) return json({ skipped: "تعذّر تنزيل الملف" });
    const buf = new Uint8Array(await dl.data.arrayBuffer());
    if (buf.length === 0 || buf.length > 8 * 1024 * 1024) return json({ skipped: "حجم خارج الحد" });
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000) {
      bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    }
    const b64 = btoa(bin);

    const isPdf = (doc.file_type ?? "").startsWith("application/pdf");
    const imgTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!isPdf && !imgTypes.includes(doc.file_type ?? "")) {
      return json({ skipped: `نوع غير مدعوم: ${doc.file_type}` });
    }

    // ===== مرشّحو الملفات — فقط لمستندٍ بلا ملف =====
    let candidates: {
      id: string; title: string | null; office_num: string | null;
      court_num: string | null; kind: string | null;
    }[] = [];
    if (!doc.case_id) {
      const { data } = await admin
        .from("cases")
        .select("id, title, office_num, court_num, kind")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(150);
      candidates = data ?? [];
    }
    const candidateBlock = candidates.length
      ? "\n\nالملفات النشطة (للمطابقة — أعد id فقط عند ثقة عالية):\n" +
        candidates
          .map((c) =>
            `${c.id} | ${c.office_num ?? "-"} | ${c.title ?? "-"} | محكمة: ${c.court_num ?? "-"}`
          )
          .join("\n")
      : "";

    // ===== نداء التصنيف — tool_use إلزامي =====
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 700,
        tool_choice: { type: "tool", name: "classify" },
        tools: [{
          name: "classify",
          description: "تصنيف مستند مكتب محاماة سعودي",
          input_schema: {
            type: "object",
            properties: {
              category: { type: "string", enum: CATEGORIES },
              title: { type: "string", description: "عنوان وصفي موجز للمستند بالعربية" },
              summary: { type: "string", description: "وصف بجملة إلى جملتين: ما هو وما أهم ما فيه (أرقام، أطراف، تواريخ)" },
              case_id: {
                type: ["string", "null"],
                description: "id ملفٍ من القائمة إن ظهر بوضوح أن المستند يخصه (تطابق رقم قضية أو أطراف) — وإلا null",
              },
            },
            required: ["category", "title", "summary", "case_id"],
          },
        }],
        messages: [{
          role: "user",
          content: [
            {
              type: isPdf ? "document" : "image",
              source: { type: "base64", media_type: doc.file_type, data: b64 },
            },
            {
              type: "text",
              text:
                `صنّف هذا المستند (اسمه الأصلي: ${doc.name ?? "بلا اسم"}).` +
                candidateBlock,
            },
          ],
        }],
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      return json({ error: `Anthropic ${res.status}: ${t.slice(0, 200)}` }, 502);
    }
    const out = await res.json();
    const tu = (out.content ?? []).find((b: { type: string }) => b.type === "tool_use");
    const r = tu?.input as
      | { category: string; title: string; summary: string; case_id: string | null }
      | undefined;
    if (!r?.category) return json({ skipped: "بلا نتيجة" });

    // ===== كتابة النتيجة =====
    const suggested =
      !doc.case_id && r.case_id && candidates.some((c) => c.id === r.case_id)
        ? r.case_id
        : null;
    const keepDesc =
      doc.description && doc.description !== "أُرسل في النقاش" &&
      doc.description !== "أُرسل عبر المشاركة";
    await admin
      .from("documents")
      .update({
        category: CATEGORIES.includes(r.category) ? r.category : "أخرى",
        description: keepDesc
          ? doc.description
          : [r.title, r.summary].filter(Boolean).join(" — ").slice(0, 400),
        ...(suggested ? { suggested_case_id: suggested } : {}),
      })
      .eq("id", doc.id);

    // ===== اقتراح الملف في خيط رسالة النقاش إن وُجدت =====
    if (suggested) {
      const { data: msg } = await admin
        .from("case_comments")
        .select("id, parent_id")
        .eq("document_id", doc.id)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();
      const cand = candidates.find((c) => c.id === suggested);
      if (msg && cand) {
        const root = msg.parent_id ?? msg.id;
        const { data: dup } = await admin
          .from("case_comments")
          .select("id")
          .eq("parent_id", root)
          .eq("kind", "ai")
          .ilike("body", "هذا المستند يبدو%")
          .limit(1)
          .maybeSingle();
        if (!dup) {
          await admin.from("case_comments").insert({
            case_id: null, // رسالة المرفق بلا ملف تكون في العامة
            parent_id: root,
            kind: "ai",
            body:
              `هذا المستند يبدو «${r.category}» ويرجّح أنه يخص ملف ` +
              `«${cand.title ?? cand.office_num}» (${cand.office_num ?? ""}). ` +
              `لنقله إليه: افتح مستندات الملف.`,
          });
        }
      }
    }

    return json({
      ok: true,
      category: r.category,
      suggested_case: suggested,
    });
  } catch (e) {
    return json({ error: String(e).slice(0, 300) }, 500);
  }
});
