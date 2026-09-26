// عمل الموظف لصفحته (طلب المدير 2026-09-26: «ودي صفحة الموظف تكون أفضل من كذا بكثير»):
// الملفات بعهدته أو مشارك فيها، ومهامه المفتوحة، وجلساته القادمة، وآخر دخول له.
// كل جزء مستقل — تعذُّر واحد لا يُسقط الصفحة. والقراءة محكومة بصلاحيات القاعدة.
import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { localISO, todayISO } from '@/lib/format'

const CLOSED = '("muntahia","delivered","مكتملة")'
const MATTER_KINDS = ['case', 'bankruptcy', 'legal_service', 'property']
const MATTER_COLS = 'id, kind, office_num, title, status, court'

export interface MemberMatter {
  id: string
  kind: string | null
  office_num: string | null
  title: string | null
  status: string | null
  court: string | null
  /** مسؤول الملف أو مشارك في فريقه */
  role: 'owner' | 'member'
}

export interface MemberTask {
  id: string
  title: string | null
  due_date: string | null
  is_urgent: boolean | null
  submitted_at: string | null
  case: { id: string; kind: string | null; office_num: string | null; title: string | null } | null
}

export interface MemberSession {
  id: string
  case_id: string | null
  title: string | null
  session_date: string
  session_time: string | null
  court: string | null
}

export interface MemberWork {
  matters: MemberMatter[]
  tasks: MemberTask[]
  doneLast30: number
  sessions: MemberSession[]
  lastSeen: { login_at: string; platform: string | null } | null
  minutesThisMonth: number | null
}

async function safe<T>(p: PromiseLike<{ data: T | null; error: unknown; count?: number | null }>) {
  try {
    const r = await p
    return r.error ? null : r
  } catch {
    return null
  }
}

export function useMemberWork(member: { id: string; name: string } | null | undefined) {
  return useQuery({
    queryKey: ['member_work', member?.id],
    enabled: !!member,
    queryFn: async (): Promise<MemberWork> => {
      const id = member!.id
      const since30 = localISO(new Date(Date.now() - 30 * 864e5))
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

      const [owned, shared, tasks, done, seen, usage] = await Promise.all([
        safe(
          supabase
            .from('cases')
            .select(MATTER_COLS)
            .eq('assignee_id', id)
            .in('kind', MATTER_KINDS)
            .is('deleted_at', null)
            .not('status', 'in', CLOSED)
            .order('updated_at', { ascending: false })
            .limit(60)
        ),
        safe(
          supabase
            .from('case_members')
            .select(`case:cases!case_members_case_id_fkey(${MATTER_COLS}, deleted_at)`)
            .eq('member_id', id)
            .limit(60)
        ),
        safe(
          supabase
            .from('tasks')
            .select(
              'id, title, due_date, is_urgent, submitted_at, case:cases!tasks_case_id_fkey(id, kind, office_num, title)'
            )
            .eq('assignee_id', id)
            .neq('status', 'done')
            .is('deleted_at', null)
            .order('due_date', { ascending: true, nullsFirst: false })
            .limit(60)
        ),
        safe(
          supabase
            .from('tasks')
            .select('id', { count: 'exact', head: true })
            .eq('assignee_id', id)
            .eq('status', 'done')
            .is('deleted_at', null)
            .gte('done_at', since30)
        ),
        safe(
          supabase
            .from('usage_sessions')
            .select('login_at, platform')
            .eq('user_name', member!.name)
            .order('login_at', { ascending: false })
            .limit(1)
        ),
        safe(
          supabase
            .from('usage_sessions')
            .select('minutes')
            .eq('user_name', member!.name)
            .gte('login_at', monthStart)
            .limit(2000)
        ),
      ])

      const matters: MemberMatter[] = ((owned?.data ?? []) as Omit<MemberMatter, 'role'>[]).map(
        (m) => ({ ...m, role: 'owner' as const })
      )
      const seenIds = new Set(matters.map((m) => m.id))
      type SharedRow = { case: (Omit<MemberMatter, 'role'> & { deleted_at: string | null }) | null }
      for (const row of (shared?.data ?? []) as unknown as SharedRow[]) {
        const c = row.case
        if (!c || c.deleted_at || seenIds.has(c.id)) continue
        if (!MATTER_KINDS.includes(c.kind ?? '')) continue
        if (['muntahia', 'delivered', 'مكتملة'].includes(c.status ?? '')) continue
        seenIds.add(c.id)
        matters.push({ ...c, role: 'member' })
      }

      // الجلسات القادمة في ملفاته — ٤٥ يوماً للأمام
      let sessions: MemberSession[] = []
      if (seenIds.size) {
        const until = localISO(new Date(Date.now() + 45 * 864e5))
        const s = await safe(
          supabase
            .from('sessions')
            .select('id, case_id, title, session_date, session_time, court')
            .in('case_id', [...seenIds])
            .gte('session_date', todayISO())
            .lte('session_date', until)
            .order('session_date', { ascending: true })
            .order('session_time', { ascending: true, nullsFirst: false })
            .limit(20)
        )
        sessions = (s?.data ?? []) as MemberSession[]
      }

      const usageRows = (usage?.data ?? null) as { minutes: number | null }[] | null
      return {
        matters,
        tasks: (tasks?.data ?? []) as unknown as MemberTask[],
        doneLast30: done?.count ?? 0,
        sessions,
        lastSeen: ((seen?.data ?? []) as MemberWork['lastSeen'][])[0] ?? null,
        minutesThisMonth: usageRows ? usageRows.reduce((s, r) => s + (r.minutes ?? 0), 0) : null,
      }
    },
  })
}
