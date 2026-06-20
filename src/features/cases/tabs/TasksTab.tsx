import { useMemo, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  ListTodo,
  AlertTriangle,
  CalendarClock,
  X,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { fmtNumber, fmtDate, todayISO } from '@/lib/format'
import { useAuth } from '@/stores/auth'
import { useTeamMembers } from '@/hooks/useTeam'
import {
  useCaseTasks,
  useAddTask,
  useUpdateTask,
  useDeleteTask,
  useToggleTask,
  useAddSubtask,
  useToggleSubtask,
  useDeleteSubtask,
} from '@/hooks/useCaseTasks'
import {
  TASK_PRIORITY_OPTIONS,
  taskPriorityBadge,
  taskPriorityLabel,
} from '@/lib/caseLabels'
import type { Task } from '@/types/db'

type Filter = 'all' | 'todo' | 'done'

export function TasksTab({ caseId }: { caseId: string }) {
  const { data, isLoading } = useCaseTasks(caseId)
  const deleteM = useDeleteTask(caseId)
  const [filter, setFilter] = useState<Filter>('all')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Task | null>(null)
  const [toDelete, setToDelete] = useState<Task | null>(null)

  const list = useMemo(() => {
    const tasks = data ?? []
    if (filter === 'todo') return tasks.filter((t) => t.status !== 'done')
    if (filter === 'done') return tasks.filter((t) => t.status === 'done')
    return tasks
  }, [data, filter])

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          {(['all', 'todo', 'done'] as Filter[]).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? 'default' : 'outline'}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'الكل' : f === 'todo' ? 'قيد التنفيذ' : 'مكتملة'}
            </Button>
          ))}
        </div>
        <Button
          variant="gold"
          onClick={() => {
            setEditing(null)
            setFormOpen(true)
          }}
        >
          <Plus className="h-4 w-4" />
          مهمة جديدة
        </Button>
      </div>

      {list.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-3">
          {list.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              caseId={caseId}
              onEdit={() => {
                setEditing(t)
                setFormOpen(true)
              }}
              onDelete={() => setToDelete(t)}
            />
          ))}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <TaskForm caseId={caseId} task={editing} onDone={() => setFormOpen(false)} />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد حذف المهمة</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف المهمة «{toDelete?.title}». هل أنت متأكد؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (toDelete) deleteM.mutate(toDelete.id)
                setToDelete(null)
              }}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function Checkbox({
  checked,
  onChange,
  className,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  className?: string
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className={cn('h-4 w-4 shrink-0 cursor-pointer accent-gold', className)}
    />
  )
}

function TaskCard({
  task: t,
  caseId,
  onEdit,
  onDelete,
}: {
  task: Task
  caseId: string
  onEdit: () => void
  onDelete: () => void
}) {
  const toggleM = useToggleTask(caseId)
  const addSubM = useAddSubtask(caseId)
  const toggleSubM = useToggleSubtask(caseId)
  const delSubM = useDeleteSubtask(caseId)
  const [newSub, setNewSub] = useState('')

  const done = t.status === 'done'
  const subs = t.subtasks ?? []
  const subsDone = subs.filter((s) => s.is_done).length
  const overdue =
    !done && t.due_date && t.due_date < todayISO()

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-2">
          <Checkbox
            checked={done}
            onChange={(v) => toggleM.mutate({ id: t.id, done: v })}
            className="mt-1"
          />
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                'font-medium text-foreground',
                done && 'text-muted-foreground line-through'
              )}
            >
              {t.title}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge variant={taskPriorityBadge(t.priority)}>
                {taskPriorityLabel(t.priority)}
              </Badge>
              {t.is_urgent && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  عاجلة
                </Badge>
              )}
              {t.due_date && (
                <span
                  className={cn(
                    'flex items-center gap-1 text-xs',
                    overdue ? 'font-medium text-destructive' : 'text-muted-foreground'
                  )}
                >
                  <CalendarClock className="h-3 w-3" />
                  {fmtDate(t.due_date)}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {(t.description || t.notes) && (
          <p className="whitespace-pre-wrap pr-6 text-sm text-muted-foreground">
            {t.description || t.notes}
          </p>
        )}

        {/* المهام الفرعية */}
        <div className="space-y-1.5 pr-6">
          {subs.length > 0 && (
            <p className="text-xs text-muted-foreground">
              المهام الفرعية: {fmtNumber(subsDone)} من {fmtNumber(subs.length)}
            </p>
          )}
          {subs.map((s) => (
            <div key={s.id} className="flex items-center gap-2">
              <Checkbox
                checked={!!s.is_done}
                onChange={(v) => toggleSubM.mutate({ id: s.id, done: v })}
              />
              <span
                className={cn(
                  'flex-1 text-sm',
                  s.is_done && 'text-muted-foreground line-through'
                )}
              >
                {s.title}
              </span>
              <button
                className="text-muted-foreground hover:text-destructive"
                onClick={() => delSubM.mutate(s.id)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (newSub.trim()) {
                addSubM.mutate({ taskId: t.id, title: newSub.trim() })
                setNewSub('')
              }
            }}
          >
            <Input
              value={newSub}
              onChange={(e) => setNewSub(e.target.value)}
              placeholder="إضافة مهمة فرعية…"
              className="h-8 text-sm"
            />
            <Button type="submit" size="sm" variant="outline" disabled={!newSub.trim()}>
              <Plus className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <ListTodo className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="font-medium text-foreground">لا توجد مهام</p>
      <p className="text-sm text-muted-foreground">أضِف أول مهمة عبر «مهمة جديدة».</p>
    </div>
  )
}

/* ===================== نموذج المهمة ===================== */

const schema = z.object({
  title: z.string().min(1, 'العنوان مطلوب'),
  description: z.string().optional(),
  assignee_id: z.string().optional(),
  priority: z.string().min(1),
  is_urgent: z.boolean(),
  due_date: z.string().optional(),
  task_type: z.string().optional(),
})
type FormValues = z.infer<typeof schema>

function TaskForm({
  caseId,
  task,
  onDone,
}: {
  caseId: string
  task: Task | null
  onDone: () => void
}) {
  const isEdit = Boolean(task)
  const { teamMember } = useAuth()
  const { data: members } = useTeamMembers()
  const addM = useAddTask(caseId)
  const updateM = useUpdateTask(caseId)
  const pending = addM.isPending || updateM.isPending
  const activeMembers = (members ?? []).filter((m) => m.is_active)

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: task?.title ?? '',
      description: task?.description ?? '',
      assignee_id: task?.assignee_id ?? '',
      priority: task?.priority ?? 'med',
      is_urgent: task?.is_urgent ?? false,
      due_date: task?.due_date ?? '',
      task_type: task?.task_type ?? '',
    },
  })

  const isUrgent = watch('is_urgent')

  const onSubmit = async (values: FormValues) => {
    const t = (v: string | undefined) => (v && v.trim() !== '' ? v.trim() : null)
    const base = {
      title: values.title.trim(),
      description: t(values.description),
      assignee_id: values.assignee_id || null,
      priority: values.priority,
      is_urgent: values.is_urgent,
      due_date: t(values.due_date),
      task_type: t(values.task_type),
    }
    if (isEdit && task) {
      await updateM.mutateAsync({ id: task.id, input: base })
    } else {
      await addM.mutateAsync({
        case_id: caseId,
        ...base,
        created_by: teamMember?.id ?? null,
      })
    }
    onDone()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <DialogHeader>
        <DialogTitle>{isEdit ? 'تعديل مهمة' : 'مهمة جديدة'}</DialogTitle>
      </DialogHeader>

      <div className="my-4 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="t_title">العنوان *</Label>
          <Input id="t_title" {...register('title')} />
          {errors.title && (
            <p className="text-xs text-destructive">{errors.title.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="t_desc">الوصف</Label>
          <Textarea id="t_desc" rows={2} {...register('description')} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>المسؤول</Label>
            <Controller
              control={control}
              name="assignee_id"
              render={({ field }) => (
                <Select value={field.value || undefined} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر المسؤول" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeMembers.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label>الأولوية</Label>
            <Controller
              control={control}
              name="priority"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_PRIORITY_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="t_due">تاريخ الاستحقاق</Label>
            <Input id="t_due" type="date" {...register('due_date')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t_type">النوع</Label>
            <Input id="t_type" {...register('task_type')} />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={isUrgent}
            onCheckedChange={(v) => setValue('is_urgent', v)}
          />
          مهمة عاجلة
        </label>
      </div>

      <DialogFooter className="gap-2">
        <Button type="submit" variant="gold" disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {isEdit ? 'حفظ' : 'إضافة'}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          إلغاء
        </Button>
      </DialogFooter>
    </form>
  )
}
