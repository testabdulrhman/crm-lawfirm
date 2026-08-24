import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'

// تبويب «المشاريع» الموحّد (نموذج Matter — قرار المستخدم 2026-08-21):
// «ليه ما يكون تبويب واحد وكل مشروع له نموذج على حسب نوعه؟»
// (سُمّي «الملفات» أولاً ثم اعتُمدت «المشاريع» — 2026-08-24).
//
// المرحلة ١: توحيد **الواجهة** فقط — ثلاث جداول كما هي، تُدمج قراءةً في
// قائمة واحدة. توحيد القاعدة نفسها (جدول ملفات واحد يرث النقاش والذكاء
// والاشتقاق لكل الأنواع) مرحلة ثانية مدروسة عند تجهيز SaaS.

export type MatterKind = 'case' | 'legal_service' | 'property'

export interface MatterRow {
  /** مركّب: kind-id — يضمن التفرد عبر الجداول الثلاثة */
  key: string
  kind: MatterKind
  id: string
  title: string
  client: string | null
  /** قيمة الحالة الخام — كل نوع له قاموسه */
  status: string | null
  /** تاريخ للفرز والعرض: فتح القضية / استلام الخدمة / إنشاء التوثيق */
  date: string | null
  /** رقم مكتبي إن وُجد (القضايا) */
  ref: string | null
  /** المسند إليه — للفرز والعرض (التوثيق العقاري بلا إسناد بعد) */
  assigneeId: string | null
  assigneeName: string | null
  href: string
}

export function useMatters() {
  return useQuery({
    queryKey: ['matters'],
    staleTime: 60_000,
    queryFn: async (): Promise<MatterRow[]> => {
      const [cases, services, transfers] = await Promise.all([
        supabase
          .from('cases')
          .select(
            'id, title, status, open_date, office_num, assignee_id, ' +
              'contact:contacts(name), assignee:team_members!cases_assignee_id_fkey(name, short_name)'
          )
          .eq('kind', 'case')
          .is('deleted_at', null)
          .order('created_at', { ascending: false }),
        supabase
          .from('legal_services')
          .select(
            'id, title, type, status, client_name, received_at, created_at, assignee_id, assignee_name'
          )
          .is('deleted_at', null)
          .order('created_at', { ascending: false }),
        supabase
          .from('property_transfers')
          .select('id, transfer_type, status, seller_name, buyer_name, transfer_date, created_at')
          .is('deleted_at', null)
          .order('created_at', { ascending: false }),
      ])
      if (cases.error) throw cases.error
      if (services.error) throw services.error
      if (transfers.error) throw transfers.error

      const rows: MatterRow[] = [
        ...(cases.data ?? []).map((c: any) => ({
          key: `case-${c.id}`,
          kind: 'case' as const,
          id: c.id,
          title: c.title || 'قضية',
          client: c.contact?.name ?? null,
          status: c.status,
          date: c.open_date,
          ref: c.office_num,
          assigneeId: c.assignee_id ?? null,
          assigneeName: c.assignee?.short_name ?? c.assignee?.name ?? null,
          href: `/cases/${c.id}`,
        })),
        ...(services.data ?? []).map((s: any) => ({
          key: `ls-${s.id}`,
          kind: 'legal_service' as const,
          id: s.id,
          title: s.title || 'استشارة / لائحة',
          client: s.client_name,
          status: s.status,
          date: s.received_at || s.created_at?.slice(0, 10) || null,
          ref: null,
          assigneeId: s.assignee_id ?? null,
          assigneeName: s.assignee_name ?? null,
          href: `/legal-services/${s.id}`,
        })),
        ...(transfers.data ?? []).map((p: any) => ({
          key: `pt-${p.id}`,
          kind: 'property' as const,
          id: p.id,
          title:
            [p.seller_name, p.buyer_name].filter(Boolean).join(' ← ') ||
            'توثيق عقاري',
          client: p.seller_name,
          status: p.status,
          date: p.transfer_date || p.created_at?.slice(0, 10) || null,
          ref: null,
          // عرض property_transfers لا يكشف الإسناد بعد
          assigneeId: null,
          assigneeName: null,
          href: `/property/${p.id}`,
        })),
      ]

      // الأحدث تاريخاً أولاً — وما لا تاريخ له آخراً
      return rows.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    },
  })
}
