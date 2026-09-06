import { useMemo, useState } from 'react'
import { useLocation } from 'wouter'
import { Plus, Pencil, Power, Users } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { fmtNumber } from '@/lib/format'
import { useTeamMembers, useToggleActive } from '@/hooks/useTeam'
import { usePageState } from '@/hooks/usePageState'
import { useConfirm } from '@/components/ConfirmDialog'
import { EmptyState, FilteredEmptyState } from '@/components/EmptyState'
import { QueryErrorState } from '@/components/QueryErrorState'
import { TeamMemberForm } from './TeamMemberForm'
import { TeamNavTabs } from './TeamNavTabs'
import type { TeamMember } from '@/types/db'

type Filter = 'all' | 'active' | 'inactive'

const filters: { key: Filter; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'active', label: 'النشطون' },
  { key: 'inactive', label: 'الموقوفون' },
]

function MemberAvatar({ member }: { member: TeamMember }) {
  return (
    <Avatar>
      {member.avatar_url && <AvatarImage src={member.avatar_url} alt={member.name} />}
      <AvatarFallback className="bg-gold/20 text-navy dark:text-gold-200">
        {member.avatar_initial || member.name?.charAt(0) || '؟'}
      </AvatarFallback>
    </Avatar>
  )
}

export function TeamPage() {
  const { data, isLoading, isError, error, refetch } = useTeamMembers()
  const [, navigate] = useLocation()
  const toggle = useToggleActive()
  const { confirm, dialog: confirmDialog } = useConfirm()
  const [filter, setFilter] = usePageState<Filter>('team:filter', 'all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<TeamMember | null>(null)

  const members = useMemo(() => {
    const list = data ?? []
    if (filter === 'active') return list.filter((m) => m.is_active)
    if (filter === 'inactive') return list.filter((m) => !m.is_active)
    return list
  }, [data, filter])

  const openNew = () => {
    setEditing(null)
    setDialogOpen(true)
  }
  const openEdit = (m: TeamMember) => {
    setEditing(m)
    setDialogOpen(true)
  }

  // إيقاف موظف إجراء مؤثر — يمرّ بتأكيد؛ التفعيل مباشر
  const onToggle = (m: TeamMember) => {
    if (m.is_active) {
      confirm({
        title: 'إيقاف الموظف',
        description: `سيُوقف «${m.name}» ويُمنع من الدخول للنظام. متابعة؟`,
        confirmLabel: 'إيقاف',
        onConfirm: () => toggle.mutate({ id: m.id, is_active: false }),
      })
    } else {
      toggle.mutate({ id: m.id, is_active: true })
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* الترويسة */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          الموظفون{' '}
          {!isLoading && !isError && (
            <span className="text-base font-normal text-muted-foreground">
              ({fmtNumber((data ?? []).length)})
            </span>
          )}
        </h2>
        <Button variant="gold" onClick={openNew}>
          <Plus className="h-4 w-4" />
          موظف جديد
        </Button>
      </div>

      {/* التنقل: الموظفون / طلبات التوظيف */}
      <TeamNavTabs active="team" />

      {/* الفلاتر */}
      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <Button
            key={f.key}
            size="sm"
            variant={filter === f.key ? 'default' : 'outline'}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {/* المحتوى */}
      {isLoading ? (
        <>
          {/* سكيلتون جدول على الحاسب */}
          <div className="hidden space-y-2 md:block">
            <Skeleton className="h-10 w-full" />
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
          {/* سكيلتون بطاقات على الجوال */}
          <div className="grid gap-4 sm:grid-cols-2 md:hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-36 w-full" />
            ))}
          </div>
        </>
      ) : isError ? (
        <QueryErrorState
          title="تعذّر تحميل الموظفين"
          error={error}
          onRetry={() => refetch()}
        />
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          icon={Users}
          title="لا يوجد موظفون"
          description="أضِف أول موظف ليظهر هنا."
          actionLabel="موظف جديد"
          onAction={openNew}
        />
      ) : members.length === 0 ? (
        <FilteredEmptyState onClear={() => setFilter('all')} />
      ) : (
        <>
          {/* جدول على الحاسب */}
          <div className="hidden rounded-xl border bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الموظف</TableHead>
                  <TableHead>البريد</TableHead>
                  <TableHead>الجوال</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead className="text-left">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <button
                        className="flex items-center gap-3 text-right"
                        onClick={() => navigate(`/team/${m.id}`)}
                      >
                        <MemberAvatar member={m} />
                        <div className="min-w-0">
                          <p className="font-medium text-foreground hover:text-gold">
                            {m.name}
                            {m.is_director && (
                              <Badge variant="gold" className="ms-2">
                                مدير
                              </Badge>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {m.role ?? '—'}
                          </p>
                        </div>
                      </button>
                    </TableCell>
                    <TableCell dir="ltr" className="text-right">
                      {m.email ?? '—'}
                    </TableCell>
                    <TableCell dir="ltr" className="text-right">
                      {m.phone ?? '—'}
                    </TableCell>
                    <TableCell>
                      <StatusBadge active={!!m.is_active} />
                    </TableCell>
                    <TableCell className="text-left">
                      <RowActions
                        member={m}
                        pending={toggle.isPending}
                        onEdit={() => openEdit(m)}
                        onToggle={() => onToggle(m)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* بطاقات على الجوال */}
          <div className="grid gap-4 sm:grid-cols-2 md:hidden">
            {members.map((m) => (
              <div
                key={m.id}
                className="rounded-xl border bg-card p-4 shadow-sm"
              >
                <button
                  className="flex w-full items-center gap-3 text-right"
                  onClick={() => navigate(`/team/${m.id}`)}
                >
                  <MemberAvatar member={m} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-medium text-foreground">
                      {m.name}
                      {m.is_director && <Badge variant="gold">مدير</Badge>}
                      {m.member_type === 'collaborator' && (
                        <Badge variant="outline">متعاون</Badge>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {m.role ?? '—'}
                    </p>
                  </div>
                  <StatusBadge active={!!m.is_active} />
                </button>
                <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                  <p dir="ltr" className="truncate text-right">
                    {m.email ?? '—'}
                  </p>
                  <p dir="ltr" className="truncate text-right">
                    {m.phone ?? '—'}
                  </p>
                </div>
                <div className="mt-3 flex justify-end">
                  <RowActions
                    member={m}
                    pending={toggle.isPending}
                    onEdit={() => openEdit(m)}
                    onToggle={() => onToggle(m)}
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* نموذج الإضافة/التعديل — نموذج طويل: لا يُغلق بنقرة خارجه سهواً */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          className="max-w-2xl"
          onInteractOutside={(e) => e.preventDefault()}
        >
          <TeamMemberForm
            member={editing}
            onDone={() => setDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {confirmDialog}
    </div>
  )
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <Badge variant={active ? 'success' : 'secondary'}>
      {active ? 'نشط' : 'موقوف'}
    </Badge>
  )
}

function RowActions({
  member,
  pending,
  onEdit,
  onToggle,
}: {
  member: TeamMember
  pending: boolean
  onEdit: () => void
  onToggle: () => void
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      <Button variant="ghost" size="icon" onClick={onEdit} title="تعديل">
        <Pencil className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggle}
        disabled={pending}
        title={member.is_active ? 'إيقاف' : 'تفعيل'}
        className={cn(member.is_active ? 'text-emerald-600' : 'text-muted-foreground')}
      >
        <Power className="h-4 w-4" />
      </Button>
    </div>
  )
}
