import { useMemo, useState } from 'react'
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
import { useTeamMembers, useToggleActive } from '@/hooks/useTeam'
import { TeamMemberForm } from './TeamMemberForm'
import type { TeamMember } from '@/types/db'

type Filter = 'all' | 'active' | 'inactive'

const filters: { key: Filter; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'active', label: 'النشطون' },
  { key: 'inactive', label: 'غير النشطين' },
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
  const { data, isLoading } = useTeamMembers()
  const toggle = useToggleActive()
  const [filter, setFilter] = useState<Filter>('all')
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

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* الترويسة */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">الموظفون</h2>
        <Button variant="gold" onClick={openNew}>
          <Plus className="h-4 w-4" />
          موظف جديد
        </Button>
      </div>

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
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : members.length === 0 ? (
        <EmptyState />
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
                      <div className="flex items-center gap-3">
                        <MemberAvatar member={m} />
                        <div className="min-w-0">
                          <p className="font-medium text-foreground">
                            {m.name}
                            {m.is_director && (
                              <Badge variant="gold" className="mr-2">
                                مدير
                              </Badge>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {m.role ?? '—'}
                          </p>
                        </div>
                      </div>
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
                        onEdit={() => openEdit(m)}
                        onToggle={() =>
                          toggle.mutate({ id: m.id, is_active: !m.is_active })
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* بطاقات على الجوال */}
          <div className="grid gap-3 md:hidden">
            {members.map((m) => (
              <div
                key={m.id}
                className="rounded-xl border bg-card p-4 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <MemberAvatar member={m} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-medium text-foreground">
                      {m.name}
                      {m.is_director && <Badge variant="gold">مدير</Badge>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {m.role ?? '—'}
                    </p>
                  </div>
                  <StatusBadge active={!!m.is_active} />
                </div>
                <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                  <p dir="ltr" className="text-right">
                    {m.email ?? '—'}
                  </p>
                  <p dir="ltr" className="text-right">
                    {m.phone ?? '—'}
                  </p>
                </div>
                <div className="mt-3 flex justify-end">
                  <RowActions
                    member={m}
                    onEdit={() => openEdit(m)}
                    onToggle={() =>
                      toggle.mutate({ id: m.id, is_active: !m.is_active })
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* نموذج الإضافة/التعديل */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <TeamMemberForm
            member={editing}
            onDone={() => setDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>
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
  onEdit,
  onToggle,
}: {
  member: TeamMember
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
        title={member.is_active ? 'إيقاف' : 'تفعيل'}
        className={cn(member.is_active ? 'text-emerald-600' : 'text-muted-foreground')}
      >
        <Power className="h-4 w-4" />
      </Button>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Users className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="font-medium text-foreground">لا يوجد موظفون</p>
      <p className="text-sm text-muted-foreground">
        أضِف أول موظف عبر زر «موظف جديد».
      </p>
    </div>
  )
}
