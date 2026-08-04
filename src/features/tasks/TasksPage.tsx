// صفحة المهام — «مهامي» لكل موظف ولوحة الفريق للمدير.
// مجمّعة زمنياً (متأخرة/اليوم/الأسبوع/لاحقاً/بلا موعد) وإنجاز بضغطة واحدة.
import { useMemo, useState } from 'react'
import { useLocation } from 'wouter'
import {
  Plus,
  Search,
  ListTodo,
  Scale,
  Pencil,
  Trash2,
  Flame,
  CheckCircle2,
  CalendarClock,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import { fmtNumber, fmtDatePref } from '@/lib/format'
import { useAuth } from '@/stores/auth'
import { useIsDirector } from '@/hooks/useIsDirector'
import { useTeamMembers } from '@/hooks/useTeam'
import { usePageState } from '@/hooks/usePageState'
import { taskPriorityBadge, taskPriorityLabel } from '@/lib/caseLabels'
import {
  useTasks,
  useToggleTaskDone,
  useRemoveTask,
  bucketOf,
  sortTasks,
  BUCKET_LABELS,
  type BucketKey,
  type TaskRow,
} from '@/hooks/useTasks'
import { TaskFormDialog } from './TaskFormDialog'
import type { Task } from '@/types/db'

const ALL_MEMBERS = '__all__'
// ترتيب عرض المجموعات
const ORDER: BucketKey[] = ['overdue', 'today', 'week', 'later', 'someday']

export function TasksPage() {
  const isDirector = useIsDirector()
  const [scope, setScope] = usePageState<'mine' | 'all'>('tasks:scope', 'mine')
  const [assignee, setAssignee] = usePageState('tasks:assignee', ALL_MEMBERS)
  const [search, setSearch] = usePageState('tasks:q', '')
  const [showDone, setShowDone] = usePageState('tasks:done', 'no')

  const effectiveScope = isDirector ? scope : 'mine'
  const { data, isLoading } = useTasks(
    effectiveScope,
    effectiveScope === 'all' && assignee !== ALL_MEMBERS ? assignee : null
  )
  const { data: members } = useTeamMembers()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Task | null>(null)
  const [toDelete, setToDelete] = useState<TaskRow | null>(null)

  // تصفية بالبحث ثم تجميع زمني
  const { groups, doneList, openCount, overdueCount } = useMemo(() => {
    const q = search.trim().toLowerCase()
    const rows = (data ?? []).filter((t) => {
      if (!q) return true
      return [t.title, t.description, t.case?.title, t.assignee?.name]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    })

    const g = new Map<BucketKey, TaskRow[]>()
    const done: TaskRow[] = []
    for (const t of rows) {
      const b = bucketOf(t)
      if (b === 'done') {
        done.push(t)
        continue
      }
      const arr = g.get(b)
      if (arr) arr.push(t)
      else g.set(b, [t])
    }
    for (const arr of g.values()) arr.sort(sortTasks)
    done.sort((a, b) => (b.done_at ?? '').localeCompare(a.done_at ?? ''))

    return {
      groups: g,
      doneList: done,
      openCount: rows.length - done.length,
      overdueCount: g.get('overdue')?.length ?? 0,
    }
  }, [data, search])

  const openNew = () => {
    setEditing(null)
    setFormOpen(true)
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {/* الترويسة */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            المهام{' '}
            <span className="text-base font-normal text-muted-foreground">
              ({fmtNumber(openCount)} مفتوحة)
            </span>
          </h2>
          {overdueCount > 0 && (
            <p className="mt-0.5 text-sm font-medium text-destructive">
              {fmtNumber(overdueCount)} متأخرة تحتاج انتباهك
            </p>
          )}
        </div>
        <Button variant="gold" onClick={openNew}>
          <Plus className="h-4 w-4" />
          مهمة جديدة
        </Button>
      </div>

      {/* النطاق: مهامي / الفريق (للمدير) */}
      {isDirector && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border bg-card p-1">
            {(['mine', 'all'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                  effectiveScope === s
                    ? 'bg-gold text-navy'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {s === 'mine' ? 'مهامي' : 'مهام الفريق'}
              </button>
            ))}
          </div>

          {effectiveScope === 'all' && (
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger className="h-9 w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_MEMBERS}>كل الموظفين</SelectItem>
                {(members ?? [])
                  .filter((m) => m.is_active)
                  .map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.short_name || m.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {/* البحث */}
      <div className="relative">
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث في المهام…"
          className="pr-9"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : openCount === 0 && doneList.length === 0 ? (
        <EmptyState onAdd={openNew} />
      ) : (
        <div className="space-y-5">
          {ORDER.map((b) => {
            const list = groups.get(b)
            if (!list || list.length === 0) return null
            return (
              <TaskGroup
                key={b}
                bucket={b}
                tasks={list}
                onEdit={(t) => {
                  setEditing(t)
                  setFormOpen(true)
                }}
                onDelete={setToDelete}
              />
            )
          })}

          {/* المكتملة — مطوية افتراضياً */}
          {doneList.length > 0 && (
            <div className="space-y-2">
              <button
                onClick={() => setShowDone(showDone === 'yes' ? 'no' : 'yes')}
                className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
              >
                <CheckCircle2 className="h-4 w-4" />
                {BUCKET_LABELS.done} ({fmtNumber(doneList.length)})
                <span className="text-xs font-normal">
                  {showDone === 'yes' ? '— إخفاء' : '— عرض'}
                </span>
              </button>
              {showDone === 'yes' && (
                <div className="divide-y overflow-hidden rounded-xl border bg-card">
                  {doneList.slice(0, 50).map((t) => (
                    <TaskRowItem
                      key={t.id}
                      task={t}
                      onEdit={(x) => {
                        setEditing(x)
                        setFormOpen(true)
                      }}
                      onDelete={setToDelete}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <TaskFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        task={editing}
      />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف المهمة</AlertDialogTitle>
            <AlertDialogDescription>
              سيُحذف «{toDelete?.title}» نهائياً. متابعة؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <DeleteAction task={toDelete} onDone={() => setToDelete(null)} />
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function DeleteAction({
  task,
  onDone,
}: {
  task: TaskRow | null
  onDone: () => void
}) {
  const removeM = useRemoveTask()
  return (
    <AlertDialogAction
      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
      onClick={() => {
        if (task) removeM.mutate(task.id)
        onDone()
      }}
    >
      حذف
    </AlertDialogAction>
  )
}

function TaskGroup({
  bucket,
  tasks,
  onEdit,
  onDelete,
}: {
  bucket: BucketKey
  tasks: TaskRow[]
  onEdit: (t: Task) => void
  onDelete: (t: TaskRow) => void
}) {
  const isOverdue = bucket === 'overdue'
  const isToday = bucket === 'today'
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <CalendarClock
          className={cn(
            'h-4 w-4',
            isOverdue ? 'text-destructive' : isToday ? 'text-gold' : 'text-muted-foreground'
          )}
        />
        <h3
          className={cn(
            'text-sm font-semibold',
            isOverdue ? 'text-destructive' : 'text-foreground'
          )}
        >
          {BUCKET_LABELS[bucket]}
        </h3>
        <span className="text-xs text-muted-foreground">
          ({fmtNumber(tasks.length)})
        </span>
      </div>
      <div
        className={cn(
          'divide-y overflow-hidden rounded-xl border bg-card',
          isOverdue && 'border-destructive/40'
        )}
      >
        {tasks.map((t) => (
          <TaskRowItem key={t.id} task={t} onEdit={onEdit} onDelete={onDelete} />
        ))}
      </div>
    </div>
  )
}

function TaskRowItem({
  task: t,
  onEdit,
  onDelete,
}: {
  task: TaskRow
  onEdit: (t: Task) => void
  onDelete: (t: TaskRow) => void
}) {
  const [, navigate] = useLocation()
  const { teamMember } = useAuth()
  const toggleM = useToggleTaskDone()
  const done = t.status === 'done'
  const overdue = !done && !!t.due_date && bucketOf(t) === 'overdue'
  const isMine = t.assignee_id === teamMember?.id

  return (
    <div className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-accent/5">
      <input
        type="checkbox"
        checked={done}
        onChange={(e) => toggleM.mutate({ id: t.id, done: e.target.checked })}
        className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-gold"
        aria-label={done ? 'إرجاع للمهام' : 'إنجاز المهمة'}
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {t.is_urgent && !done && (
            <Flame className="h-3.5 w-3.5 shrink-0 text-destructive" />
          )}
          <p
            className={cn(
              'text-sm font-medium',
              done && 'text-muted-foreground line-through'
            )}
          >
            {t.title}
          </p>
          {!done && t.priority && t.priority !== 'med' && (
            <Badge variant={taskPriorityBadge(t.priority)} className="shrink-0">
              {taskPriorityLabel(t.priority)}
            </Badge>
          )}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {t.due_date && (
            <span className={cn(overdue && 'font-semibold text-destructive')}>
              {fmtDatePref(t.due_date)}
            </span>
          )}
          {!isMine && t.assignee && (
            <span>{t.assignee.short_name || t.assignee.name}</span>
          )}
          {t.case && (
            <button
              onClick={() => navigate(`/cases/${t.case!.id}`)}
              className="flex items-center gap-1 hover:text-gold"
            >
              <Scale className="h-3 w-3" />
              <span className="max-w-[16rem] truncate">{t.case.title}</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground"
          title="تعديل"
          onClick={() => onEdit(t)}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          title="حذف"
          onClick={() => onDelete(t)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <ListTodo className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="font-medium text-foreground">لا مهام مفتوحة 🎉</p>
      <p className="mx-auto mb-4 max-w-sm text-sm text-muted-foreground">
        أضِف مهمة مرتبطة بقضية أو مهمة إدارية بلا قضية — وستظهر هنا مرتّبة
        بموعدها.
      </p>
      <Button variant="gold" size="sm" onClick={onAdd}>
        <Plus className="h-4 w-4" />
        مهمة جديدة
      </Button>
    </div>
  )
}
