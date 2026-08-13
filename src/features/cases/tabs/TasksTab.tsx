// مهام القضية — موحَّد على نظام غرفة العمل: الصف يفتح غرفة المهمة،
// والإنشاء عبر النموذج الموحّد TaskFormDialog بقضية مثبَّتة.
// (النموذج الخاص والمهام الفرعية المضمّنة القديمة انتقلا إلى غرفة المهمة.)
import { useState } from 'react'
import { useLocation } from 'wouter'
import { Plus, ListTodo, Flame, Pencil, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
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
import { QueryErrorState } from '@/components/QueryErrorState'
import { EmptyState } from '@/components/EmptyState'
import { cn } from '@/lib/utils'
import { arPlural, fmtDatePref, todayISO } from '@/lib/format'
import {
  taskPriorityBadge,
  taskPriorityLabel,
} from '@/lib/caseLabels'
import { useCaseTasks, useToggleTask, useDeleteTask } from '@/hooks/useCaseTasks'
import { TaskFormDialog } from '@/features/tasks/TaskFormDialog'
import type { Task } from '@/types/db'

export function TasksTab({ caseId }: { caseId: string }) {
  const [, navigate] = useLocation()
  const { data: tasks, isLoading, isError, error, refetch } = useCaseTasks(caseId)
  const toggleM = useToggleTask(caseId)
  const deleteM = useDeleteTask(caseId)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Task | null>(null)
  const [toDelete, setToDelete] = useState<Task | null>(null)

  const list = tasks ?? []
  const openCount = list.filter((t) => t.status !== 'done').length

  const openNew = () => {
    setEditing(null)
    setFormOpen(true)
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-xl" />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <QueryErrorState
        title="تعذّر تحميل المهام"
        error={error}
        onRetry={() => refetch()}
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {openCount > 0
            ? arPlural(openCount, {
                one: 'مهمة مفتوحة',
                two: 'مهمتان مفتوحتان',
                many: 'مهام مفتوحة',
              })
            : 'لا مهام مفتوحة'}
        </p>
        <Button variant="gold" size="sm" onClick={openNew}>
          <Plus className="h-4 w-4" />
          مهمة جديدة
        </Button>
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={ListTodo}
          title="لا مهام لهذه القضية بعد"
          description="أنشئ مهمة مرتبطة بالقضية لتظهر هنا وفي غرفة المهام."
          actionLabel="مهمة جديدة"
          onAction={openNew}
        />
      ) : (
        <div className="divide-y overflow-hidden rounded-xl border bg-card">
          {list.map((t) => {
            const done = t.status === 'done'
            const inReview = t.status === 'review'
            const overdue = !done && !!t.due_date && t.due_date < todayISO()
            return (
              <div
                key={t.id}
                className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-accent/5"
              >
                {/* label بحشوة توسّع هدف اللمس حول الصندوق دون تغيير التخطيط */}
                <label className="-m-2 flex shrink-0 cursor-pointer p-2">
                  <input
                    type="checkbox"
                    checked={done}
                    disabled={inReview}
                    onChange={(e) =>
                      toggleM.mutate({ id: t.id, done: e.target.checked })
                    }
                    className="mt-1 h-4 w-4 cursor-pointer accent-gold disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label={done ? 'إرجاع للمهام' : 'إنجاز المهمة'}
                    title={inReview ? 'بانتظار الاعتماد — تُدار من غرفة المهمة' : undefined}
                  />
                </label>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {t.is_urgent && !done && (
                      <Flame className="h-3.5 w-3.5 shrink-0 text-destructive" />
                    )}
                    <button
                      onClick={() => navigate(`/tasks/${t.id}`)}
                      className={cn(
                        'text-right text-sm font-medium hover:text-gold',
                        done && 'text-muted-foreground line-through'
                      )}
                    >
                      {t.title}
                    </button>
                    {inReview && (
                      <Badge variant="warning" className="shrink-0">
                        بانتظار الاعتماد
                      </Badge>
                    )}
                    {!done && t.priority && t.priority !== 'med' && (
                      <Badge
                        variant={taskPriorityBadge(t.priority)}
                        className="shrink-0"
                      >
                        {taskPriorityLabel(t.priority)}
                      </Badge>
                    )}
                  </div>
                  {t.due_date && (
                    <p
                      className={cn(
                        'mt-0.5 text-xs text-muted-foreground',
                        overdue && 'font-semibold text-destructive'
                      )}
                    >
                      {fmtDatePref(t.due_date)}
                      {overdue && ' — متأخرة'}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground"
                    title="تعديل"
                    onClick={() => {
                      setEditing(t)
                      setFormOpen(true)
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    title="حذف"
                    onClick={() => setToDelete(t)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <TaskFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        task={editing}
        fixedCaseId={caseId}
      />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف المهمة</AlertDialogTitle>
            <AlertDialogDescription>
              سيُحذف «{toDelete?.title}» مع إمكانية الاسترجاع من قِبل المدير.
              متابعة؟
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
