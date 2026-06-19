# CRM — شركة عبدالرحمن بن رضوان المشيقح للمحاماة وإدارة إجراءات الإفلاس

نظام إدارة مكتب محاماة (الإصدار v2). واجهة عربية كاملة (RTL) بخط Noto Sans Arabic.

## التقنيات

- React 19 + TypeScript + Vite 6
- Tailwind CSS 3.4 + shadcn/ui
- Wouter (routing) · Zustand (الحالة) · TanStack Query v5 (البيانات)
- React Hook Form + Zod (النماذج والتحقق)
- Supabase JS v2 (Auth + Database + Storage)
- Lucide React (الأيقونات)

## الهوية البصرية

- الكحلي `#111D3A` · الذهبي `#C9A84C` · خلفية بيج `#F8F7F4`
- الوضع الليلي مدعوم عبر `class` على `<html>`.

## التشغيل محلياً

```bash
npm install
cp .env.example .env   # ثم عبّئ مفاتيح Supabase
npm run dev
```

## البناء

```bash
npm run build   # tsc -b && vite build → dist/
```

## متغيّرات البيئة

| المتغيّر | الوصف |
| --- | --- |
| `VITE_SUPABASE_URL` | رابط مشروع Supabase |
| `VITE_SUPABASE_ANON_KEY` | مفتاح anon (آمن للواجهة، الحماية عبر RLS) |

## النشر

- مستضاف على Netlify بنشر تلقائي عند كل `git push` إلى `main`.
- **Build command:** `npm run build` — **Publish directory:** `dist`
- توجيه SPA عبر `public/_redirects` و`netlify.toml`.

## الوحدات الحالية

- تسجيل الدخول (Supabase Auth، الربط عبر `team_members.auth_id`)
- لوحة التحكم (أعداد فعلية من القاعدة)
- الموظفون (`team_members`): عرض/إضافة/تعديل/تبديل الحالة
- الإعدادات: بيانات المكتب (`office_info`) · التصنيفات (`lookup_values`) · المظهر

## وحدات قادمة

الطلبات الواردة → طلبات التوظيف → جهات الاتصال → القضايا → الوكالات →
الاستشارات → التوثيق العقاري → المواعيد → المكالمات → الصادر → التقارير → التكاملات.
