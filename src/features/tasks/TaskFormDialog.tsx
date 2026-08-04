// نموذج مهمة موحّد — يعمل من صفحة المهام أو من داخل قضية.
// القضية اختيارية: تُترك فارغة للمهام الإدارية.
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
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
import { CasePicker } from '@/components/CasePicker'
import { DualDatePicker } from '@/components/DualDatePicker'
import { useAuth } from '@/stores/auth'
import { useTeamMembers } from '@/hooks/useTeam'
import { useCases } from '@/hooks/useCases'
import { useSaveTask } from '@/hooks/useTasks'
import { TASK_PRIORITY_OPTIONS } from '@/lib/caseLabels'
import type { Task, TaskInput } from '@/types/db'

const NO_ASSIGNEE = '__none__'

export function TaskFormDialog({
  open,
  onOpenChange,
  task,
  fixedCaseId,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  task?: Task | null
  /** عند الفتح من داخل قضية: تُثبَّت ولا يظهر منتقي القضايا */
  fixedCaseId?: string
}) {
  const { teamMember } = useAuth()
  const { data: members } = useTeamMembers()
  const { data: cases } = useCases()
  const saveM = useSaveTask()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assigneeId, setAssigneeId] = useState<string>(NO_ASSIGNEE)
  const [priority, setPriority] = useState('med')
  const [dueDate, setDueDate] = useState<string | null>(null)
  const [isUrgent, setIsUrgent] = useState(false)
  const [caseId, setCaseId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // تعبئة القيم عند كل فتح (جديدة أو تعديل)
  useEffect(() => {
    if (!open) return
    setError(null)
    setTitle(task?.title ?? '')
    setDescription(task?.description ?? '')
    setAssigneeId(task?.assignee_id ?? teamMember?.id ?? NO_ASSIGNEE)
    setPriority(task?.priority ?? 'med')
    setDueDate(task?.due_date ?? null)
    setIsUrgent(!!task?.is_urgent)
    setCaseId(task?.case_id ?? fixedCaseId ?? null)
  }, [open, task, fixedCaseId, teamMember?.id])

  const submit = () => {
    if (!title.trim()) {
      setError('عنوان المهمة مطلوب.')
      return
    }
    setError(null)
    const input: TaskInput = {
      title: title.trim(),
      description: description.trim() || null,
      assignee_id: assigneeId === NO_ASSIGNEE ? null : assigneeId,
      priority,
      due_date: dueDate,
      is_urgent: isUrgent,
      case_id: fixedCaseId ?? caseId,
    }
    if (!task) input.created_by = teamMember?.id ?? null
    saveM.mutate(
      { id: task?.id ?? null, input },
      { onSuccess: () => onOpenChange(false) }
    )
  }

  const activeMembers = (members ?? []).filter((m) => m.is_active)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{task ? 'تعديل المهمة' : 'مهمة جديدة'}</DialogTitle>
        </DialogHeader>

        <div className="max-h-[62vh] space-y-3 overflow-y-auto pl-1 pr-1">
          <div className="space-y-1.5">
            <Label htmlFor="task_title">ما المطلوب عمله؟ *</Label>
            <Input
              id="task_title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثال: تقديم لائحة اعتراضية"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="task_desc">تفاصيل (اختياري)</Label>
            <Textarea
              id="task_desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>المسؤول</Label>
              <Select value={assigneeId} onValueChange={setAssigneeId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_ASSIGNEE}>بلا مسؤول</SelectItem>
                  {activeMembers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.short_name || m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>الأولوية</Label>
              <Select value={priority} onValueChange={setPriority}>
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
            </div>
          </div>

          <DualDatePicker
            label="تاريخ الاستحقاق"
            value={dueDate}
            onChange={setDueDate}
          />

          {/* القضية — تُخفى عند الفتح من داخل قضية */}
          {!fixedCaseId && (
            <div className="space-y-1.5">
              <Label>
                القضية{' '}
                <span className="font-normal text-muted-foreground">
                  (اختياري — اتركها فارغة للمهام الإدارية)
                </span>
              </Label>
              <CasePicker
                cases={cases ?? []}
                value={caseId}
                onChange={setCaseId}
              />
            </div>
          )}

          <div className="flex items-center justify-between rounded-xl border p-3">
            <div>
              <p className="text-sm font-medium text-foreground">عاجلة</p>
              <p className="text-xs text-muted-foreground">
                تظهر في أعلى القائمة بعلامة حمراء
              </p>
            </div>
            <Switch checked={isUrgent} onCheckedChange={setIsUrgent} />
          </div>

          {error && <p className="text-xs font-medium text-destructive">{error}</p>}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="gold" onClick={submit} disabled={saveM.isPending}>
            {saveM.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {task ? 'حفظ التعديلات' : 'إضافة المهمة'}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
