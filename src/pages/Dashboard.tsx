import { useQuery } from '@tanstack/react-query'
import {
  Briefcase,
  Contact,
  UserCheck,
  Inbox,
  type LucideIcon,
} from 'lucide-react'

import { supabase } from '@/lib/supabase'
import { fmtNumber } from '@/lib/format'
import { useAuth } from '@/stores/auth'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface StatDef {
  key: string
  label: string
  icon: LucideIcon
  accent: string
  load: () => Promise<number>
}

async function countOf(
  table: string,
  apply?: (q: ReturnType<typeof baseCount>) => ReturnType<typeof baseCount>
): Promise<number> {
  let query = baseCount(table)
  if (apply) query = apply(query)
  const { count, error } = await query
  if (error) throw error
  return count ?? 0
}

function baseCount(table: string) {
  return supabase.from(table).select('*', { count: 'exact', head: true })
}

const stats: StatDef[] = [
  {
    key: 'cases',
    label: 'إجمالي القضايا',
    icon: Briefcase,
    accent: 'text-navy bg-navy/10 dark:text-navy-100 dark:bg-navy-100/10',
    load: () => countOf('cases'),
  },
  {
    key: 'contacts',
    label: 'جهات الاتصال',
    icon: Contact,
    accent: 'text-gold-600 bg-gold/15 dark:text-gold-300',
    load: () => countOf('contacts'),
  },
  {
    key: 'active_team',
    label: 'الموظفون النشطون',
    icon: UserCheck,
    accent: 'text-emerald-600 bg-emerald-500/10 dark:text-emerald-300',
    load: () => countOf('team_members', (q) => q.eq('is_active', true)),
  },
  {
    key: 'pending_requests',
    label: 'الطلبات الواردة المعلّقة',
    icon: Inbox,
    accent: 'text-amber-600 bg-amber-500/10 dark:text-amber-300',
    load: () =>
      countOf('incoming_requests', (q) => q.eq('status', 'under_review')),
  },
]

function StatCard({ stat }: { stat: StatDef }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['dashboard-count', stat.key],
    queryFn: stat.load,
  })
  const Icon = stat.icon

  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4 p-5">
        <div className="min-w-0">
          <p className="truncate text-sm text-muted-foreground">{stat.label}</p>
          {isLoading ? (
            <Skeleton className="mt-2 h-8 w-16" />
          ) : (
            <p className="mt-1 text-3xl font-bold text-foreground">
              {isError ? '—' : fmtNumber(data ?? 0)}
            </p>
          )}
        </div>
        <div
          className={cn(
            'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl',
            stat.accent
          )}
        >
          <Icon className="h-6 w-6" />
        </div>
      </CardContent>
    </Card>
  )
}

export default function Dashboard() {
  const { teamMember } = useAuth()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">
          مرحباً، {teamMember?.name ?? 'بك'} 👋
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          نظرة عامة سريعة على نشاط المكتب
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <StatCard key={stat.key} stat={stat} />
        ))}
      </div>

      {/* ستتوسّع لوحة التحكم لاحقاً (رسوم، مهام اليوم، الجلسات القادمة...) */}
    </div>
  )
}
