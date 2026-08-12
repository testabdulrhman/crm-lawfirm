// غرفة عمل المهمة: الفريق يشتغل، ملف العمل يتحدّث بنسخ، نقاش بمنشن،
// ثم رفع للاعتماد — نهائي أو متسلسل (اعتماد ثم إحالة لمدير آخر).
import { useMemo, useRef, useState } from 'react'
import { useLocation } from 'wouter'
import {
  ArrowRight,
  Pencil,
  Trash2,
  Flame,
  Scale,
  FileUp,
  FileText,
  Download,
  Send,
  Stamp,
  CornerUpRight,
  Undo2,
  Loader2,
  UserPlus,
  X,
  AtSign,
  CheckCircle2,
  History,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertTitle } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { fmtDatePref, fmtDateTime, fmtNumber } from '@/lib/format'
import { pickFile } from '@/lib/files'
import { useAuth } from '@/stores/auth'
import { useIsDirector } from '@/hooks/useIsDirector'
import { useTeamMembers } from '@/hooks/useTeam'
import { useRemoveTask } from '@/hooks/useTasks'
import {
  taskPriorityBadge,
  taskPriorityLabel,
  taskStatusLabel,
} from '@/lib/caseLabels'
import {
  useTaskDetail,
  useTaskParticipants,
  useTaskFiles,
  useTaskComments,
  useTaskApprovals,
  useAddParticipant,
  useRemoveParticipant,
  useUploadTaskVersion,
  useAddComment,
  useDeleteComment,
  useSubmitForReview,
  useApproveTask,
  useReturnTask,
  useTaskSubtasks,
  useAddSubtask,
  useToggleSubtask,
  useDeleteSubtask,
  buildTimeline,
  APPROVAL_ACTION_LABELS,
  type TimelineItem,
} from '@/hooks/useTaskRoom'
import { TaskFormDialog } from './TaskFormDialog'

export function TaskRoomPage({ id }: { id: string }) {
  const [, navigate] = useLocation()
  const { teamMember } = useAuth()
  const isDirector = useIsDirector()

  const { data: task, isLoading, isError } = useTaskDetail(id)
  const { data: participants } = useTaskParticipants(id)
  const { data: files } = useTaskFiles(id)
  const { data: comments } = useTaskComments(id)
  const { data: approvals } = useTaskApprovals(id)
  const { data: members } = useTeamMembers()

  const removeM = useRemoveTask()

  const [editOpen, setEditOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const timeline = useMemo(
    () => buildTimeline(comments ?? [], files ?? [], approvals ?? []),
    [comments, files, approvals]
  )

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (isError || !task) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Button variant="ghost" onClick={() => navigate('/tasks')}>
          <ArrowRight className="h-4 w-4" />
          رجوع للمهام
        </Button>
        <Alert variant="destructive">
          <AlertTitle>تعذّر تحميل المهمة — قد تكون حُذفت</AlertTitle>
        </Alert>
      </div>
    )
  }

  const done = task.status === 'done'
  const inReview = task.status === 'review'
  // من بيده الاعتماد: المحال له تحديداً، أو أي مدير إن كانت مفتوحة
  const canApprove =
    inReview &&
    (task.review_by === teamMember?.id || (!task.review_by && isDirector))

  const activeMembers = (members ?? []).filter((m) => m.is_active)
  const directors = activeMembers.filter((m) => m.is_director)
  const latestFile = (files ?? [])[0] ?? null

  // من يُبلَّغ بنتيجة الاعتماد: الرافع + المسؤول + الفريق
  const teamIds = [
    task.submitted_by,
    task.assignee_id,
    ...(participants ?? []).map((p) => p.member_id),
  ].filter((v, i, a): v is string => !!v && a.indexOf(v) === i)

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" onClick={() => navigate('/tasks')}>
          <ArrowRight className="h-4 w-4" />
          رجوع للمهام
        </Button>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" />
            تعديل
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="h-4 w-4" />
            حذف
          </Button>
        </div>
      </div>

      {/* رأس المهمة */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              {task.is_urgent && !done && (
                <Flame className="h-4 w-4 shrink-0 text-destructive" />
              )}
              <h2
                className={cn(
                  'text-xl font-bold text-foreground',
                  done && 'text-muted-foreground line-through'
                )}
              >
                {task.title}
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge
                variant={done ? 'success' : inReview ? 'warning' : 'default'}
              >
                {taskStatusLabel(task.status)}
              </Badge>
              {task.priority && task.priority !== 'med' && (
                <Badge variant={taskPriorityBadge(task.priority)}>
                  {taskPriorityLabel(task.priority)}
                </Badge>
              )}
              {task.due_date && (
                <span className="text-xs text-muted-foreground">
                  الاستحقاق: {fmtDatePref(task.due_date)}
                </span>
              )}
              {task.case && (
                <button
                  onClick={() => navigate(`/cases/${task.case!.id}`)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-gold"
                >
                  <Scale className="h-3 w-3" />
                  {task.case.title}
                </button>
              )}
            </div>
            {task.description && (
              <p className="whitespace-pre-wrap pt-1 text-sm text-muted-foreground">
                {task.description}
              </p>
            )}
          </div>

          {/* الفريق */}
          <TeamStrip
            taskId={id}
            taskTitle={task.title}
            assignee={task.assignee ?? null}
            participants={participants ?? []}
            members={activeMembers}
          />
        </CardContent>
      </Card>

      {/* الاعتماد — يظهر لمن بيده القرار */}
      {canApprove && (
        <ApprovalBanner
          taskId={id}
          taskTitle={task.title}
          latestFileId={latestFile?.id ?? null}
          directors={directors.filter((d) => d.id !== teamMember?.id)}
          notifyIds={teamIds}
        />
      )}
      {inReview && !canApprove && (
        <Alert>
          <Stamp className="h-4 w-4" />
          <AlertTitle className="text-sm font-medium">
            بانتظار اعتماد {task.reviewer?.short_name || task.reviewer?.name || 'أحد المدراء'}
            {task.submitted_at && ` — رُفعت ${fmtDateTime(task.submitted_at)}`}
          </AlertTitle>
        </Alert>
      )}

      {/* ملف العمل */}
      <WorkFileCard
        taskId={id}
        taskTitle={task.title}
        files={files ?? []}
        canSubmit={!done && !inReview}
        directors={directors}
        notifyAnyDirectorIds={directors.map((d) => d.id)}
      />

      {/* قائمة التحقق */}
      <ChecklistCard taskId={id} readOnly={done} />

      {/* الخط الزمني + التعليق */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <h3 className="flex items-center gap-2 text-[15px] font-semibold text-foreground">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gold/10">
              <History className="h-[18px] w-[18px] text-gold" />
            </span>
            سير العمل والنقاش
            {timeline.length > 0 && (
              <span className="text-sm font-normal text-muted-foreground">
                ({fmtNumber(timeline.length)})
              </span>
            )}
          </h3>

          {timeline.length === 0 ? (
            <p className="rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">
              لا شيء بعد — ارفع ملف العمل أو اكتب أول تعليق.
            </p>
          ) : (
            <ol className="space-y-3">
              {timeline.map((item) => (
                <TimelineRow
                  key={
                    item.kind === 'comment'
                      ? `c-${item.comment.id}`
                      : item.kind === 'file'
                        ? `f-${item.file.id}`
                        : `a-${item.approval.id}`
                  }
                  item={item}
                  taskId={id}
                  myId={teamMember?.id ?? null}
                  isDirector={isDirector}
                />
              ))}
            </ol>
          )}

          <Composer taskId={id} taskTitle={task.title} members={activeMembers} />
        </CardContent>
      </Card>

      <TaskFormDialog open={editOpen} onOpenChange={setEditOpen} task={task} />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف المهمة</AlertDialogTitle>
            <AlertDialogDescription>
              سيُحذف «{task.title}» مع إمكانية الاسترجاع من قِبل المدير. متابعة؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                removeM.mutate(id, { onSuccess: () => navigate('/tasks') })
              }
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/* ===================== الفريق ===================== */

function MemberDot({
  name,
  color,
  initial,
  size = 'md',
}: {
  name: string | null
  color?: string | null
  initial?: string | null
  size?: 'sm' | 'md'
}) {
  return (
    <span
      title={name ?? ''}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-bold text-white',
        size === 'md' ? 'h-8 w-8 text-sm' : 'h-6 w-6 text-xs'
      )}
      style={{ backgroundColor: color || '#8a7434' }}
    >
      {initial || (name ?? '؟').slice(0, 1)}
    </span>
  )
}

function TeamStrip({
  taskId,
  taskTitle,
  assignee,
  participants,
  members,
}: {
  taskId: string
  taskTitle: string | null
  assignee: {
    id: string
    name: string | null
    short_name: string | null
    avatar_color: string | null
    avatar_initial: string | null
  } | null
  participants: ReturnType<typeof useTaskParticipants>['data'] & {}
  members: { id: string; name: string; short_name: string | null }[]
}) {
  const addM = useAddParticipant(taskId)
  const removeM = useRemoveParticipant(taskId)
  const [pickOpen, setPickOpen] = useState(false)

  const inTeam = new Set([
    ...(assignee ? [assignee.id] : []),
    ...participants.map((p) => p.member_id),
  ])
  const addable = members.filter((m) => !inTeam.has(m.id))

  return (
    <div className="flex flex-wrap items-center gap-2 border-t pt-3">
      <span className="text-xs font-medium text-muted-foreground">الفريق:</span>
      {assignee && (
        <span className="flex items-center gap-1.5 rounded-full bg-gold/10 py-1 pl-3 pr-1">
          <MemberDot
            name={assignee.name}
            color={assignee.avatar_color}
            initial={assignee.avatar_initial}
            size="sm"
          />
          <span className="text-xs font-medium text-foreground">
            {assignee.short_name || assignee.name}
          </span>
          <span className="text-[10px] text-muted-foreground">مسؤول</span>
        </span>
      )}
      {participants.map((p) => (
        <span
          key={p.id}
          className="group flex items-center gap-1.5 rounded-full bg-muted py-1 pl-2 pr-1"
        >
          <MemberDot
            name={p.member?.name ?? null}
            color={p.member?.avatar_color}
            initial={p.member?.avatar_initial}
            size="sm"
          />
          <span className="text-xs text-foreground">
            {p.member?.short_name || p.member?.name}
          </span>
          <button
            onClick={() => removeM.mutate(p.id)}
            className="rounded-full p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
            aria-label="إزالة من الفريق"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <Button
        variant="outline"
        size="sm"
        className="h-7 rounded-full px-2.5 text-xs"
        onClick={() => setPickOpen(true)}
      >
        <UserPlus className="h-3.5 w-3.5" />
        إضافة
      </Button>

      <Dialog open={pickOpen} onOpenChange={setPickOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>إضافة موظف للفريق</DialogTitle>
          </DialogHeader>
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {addable.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                كل الموظفين النشطين في الفريق أصلاً.
              </p>
            ) : (
              addable.map((m) => (
                <button
                  key={m.id}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right text-sm hover:bg-accent/10"
                  disabled={addM.isPending}
                  onClick={() =>
                    addM.mutate(
                      { memberId: m.id, taskTitle },
                      { onSuccess: () => setPickOpen(false) }
                    )
                  }
                >
                  <MemberDot name={m.name} size="sm" />
                  {m.short_name || m.name}
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ===================== ملف العمل ===================== */

function WorkFileCard({
  taskId,
  taskTitle,
  files,
  canSubmit,
  directors,
  notifyAnyDirectorIds,
}: {
  taskId: string
  taskTitle: string | null
  files: NonNullable<ReturnType<typeof useTaskFiles>['data']>
  canSubmit: boolean
  directors: { id: string; name: string; short_name: string | null }[]
  notifyAnyDirectorIds: string[]
}) {
  const uploadM = useUploadTaskVersion(taskId)
  const submitM = useSubmitForReview(taskId)

  const [note, setNote] = useState('')
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [submitOpen, setSubmitOpen] = useState(false)
  const [reviewer, setReviewer] = useState<string>('__any__')
  const [submitNote, setSubmitNote] = useState('')

  const latest = files[0] ?? null

  const onPick = async () => {
    const f = await pickFile({})
    if (f) setPendingFile(f)
  }

  const doUpload = () => {
    if (!pendingFile) return
    uploadM.mutate(
      { file: pendingFile, note: note || null },
      {
        onSuccess: () => {
          setPendingFile(null)
          setNote('')
        },
      }
    )
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-[15px] font-semibold text-foreground">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gold/10">
              <FileText className="h-[18px] w-[18px] text-gold" />
            </span>
            ملف العمل
          </h3>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onPick} disabled={uploadM.isPending}>
              <FileUp className="h-4 w-4" />
              {latest ? 'تحديث النسخة' : 'رفع الملف'}
            </Button>
            {canSubmit && latest && (
              <Button variant="gold" size="sm" onClick={() => setSubmitOpen(true)}>
                <Stamp className="h-4 w-4" />
                رفع للاعتماد
              </Button>
            )}
          </div>
        </div>

        {/* ملف بانتظار الرفع: ملاحظة «ما الذي تغيّر» ثم تأكيد */}
        {pendingFile && (
          <div className="space-y-2 rounded-xl border border-gold/40 bg-gold/5 p-3">
            <p className="text-sm font-medium text-foreground">{pendingFile.name}</p>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="ما الذي تغيّر في هذه النسخة؟ (اختياري)"
            />
            <div className="flex gap-2">
              <Button variant="gold" size="sm" onClick={doUpload} disabled={uploadM.isPending}>
                {uploadM.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                رفع النسخة {fmtNumber((latest?.version ?? 0) + 1)}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setPendingFile(null)}>
                إلغاء
              </Button>
            </div>
          </div>
        )}

        {!latest ? (
          <p className="rounded-xl border border-dashed py-6 text-center text-sm text-muted-foreground">
            لا ملف بعد — ارفع أول نسخة من ملف العمل.
          </p>
        ) : (
          <>
            {/* النسخة الأخيرة */}
            <div className="flex items-center gap-3 rounded-xl border bg-muted/30 p-3">
              <Badge variant="default" className="shrink-0">
                النسخة {fmtNumber(latest.version)}
              </Badge>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {latest.file_name || 'ملف'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {latest.uploader?.short_name || latest.uploader?.name || '—'} ·{' '}
                  {fmtDateTime(latest.created_at)}
                  {latest.note && ` · ${latest.note}`}
                </p>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" asChild>
                <a href={latest.file_url} target="_blank" rel="noopener noreferrer" title="فتح/تنزيل">
                  <Download className="h-4 w-4" />
                </a>
              </Button>
            </div>

            {/* النسخ السابقة */}
            {files.length > 1 && (
              <div className="space-y-1.5">
                <button
                  onClick={() => setShowHistory((s) => !s)}
                  className="text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  {showHistory ? 'إخفاء' : 'عرض'} النسخ السابقة (
                  {fmtNumber(files.length - 1)})
                </button>
                {showHistory && (
                  <ul className="divide-y overflow-hidden rounded-xl border">
                    {files.slice(1).map((f) => (
                      <li key={f.id} className="flex items-center gap-3 px-3 py-2">
                        <span className="shrink-0 text-xs text-muted-foreground">
                          نسخة {fmtNumber(f.version)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs text-foreground">
                            {f.file_name || 'ملف'}
                            {f.note && ` — ${f.note}`}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {f.uploader?.short_name || f.uploader?.name || '—'} ·{' '}
                            {fmtDateTime(f.created_at)}
                          </p>
                        </div>
                        <a
                          href={f.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 text-muted-foreground hover:text-gold"
                          title="فتح/تنزيل"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>

      {/* رفع للاعتماد */}
      <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>رفع المهمة للاعتماد</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>المعتمِد</Label>
              <Select value={reviewer} onValueChange={setReviewer}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__any__">أي مدير</SelectItem>
                  {directors.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.short_name || d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="submit-note">ملاحظة (اختياري)</Label>
              <Input
                id="submit-note"
                value={submitNote}
                onChange={(e) => setSubmitNote(e.target.value)}
                placeholder="ما الذي يحتاج المعتمِد معرفته؟"
              />
            </div>
            {latest && (
              <p className="text-xs text-muted-foreground">
                ستُعتمد النسخة {fmtNumber(latest.version)} — {latest.file_name}
              </p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="gold"
              disabled={submitM.isPending}
              onClick={() =>
                submitM.mutate(
                  {
                    reviewerId: reviewer === '__any__' ? null : reviewer,
                    fileId: latest?.id ?? null,
                    note: submitNote || null,
                    taskTitle,
                    directorIds: notifyAnyDirectorIds,
                  },
                  { onSuccess: () => setSubmitOpen(false) }
                )
              }
            >
              {submitM.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              <Send className="h-4 w-4" />
              رفع للاعتماد
            </Button>
            <Button variant="outline" onClick={() => setSubmitOpen(false)}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

/* ===================== الاعتماد ===================== */

function ApprovalBanner({
  taskId,
  taskTitle,
  latestFileId,
  directors,
  notifyIds,
}: {
  taskId: string
  taskTitle: string | null
  latestFileId: string | null
  /** المدراء الآخرون المتاحون للإحالة (أنا مستبعد) */
  directors: { id: string; name: string; short_name: string | null }[]
  notifyIds: string[]
}) {
  const approveM = useApproveTask(taskId)
  const returnM = useReturnTask(taskId)

  const [forwardOpen, setForwardOpen] = useState(false)
  const [forwardTo, setForwardTo] = useState<string>('')
  const [returnOpen, setReturnOpen] = useState(false)
  const [note, setNote] = useState('')

  return (
    <Card className="border-gold/50 bg-gold/5">
      <CardContent className="space-y-3 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Stamp className="h-4 w-4 text-gold" />
        هذه المهمة بانتظار اعتمادك
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="gold"
          size="sm"
          disabled={approveM.isPending}
          onClick={() =>
            approveM.mutate({
              forwardTo: null,
              fileId: latestFileId,
              note: null,
              taskTitle,
              notifyIds,
            })
          }
        >
          {approveM.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          <CheckCircle2 className="h-4 w-4" />
          اعتماد نهائي
        </Button>
        {directors.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => setForwardOpen(true)}>
            <CornerUpRight className="h-4 w-4" />
            اعتماد وإحالة
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className="text-destructive"
          onClick={() => setReturnOpen(true)}
        >
          <Undo2 className="h-4 w-4" />
          إرجاع بملاحظة
        </Button>
      </div>
      </CardContent>

      {/* اعتماد وإحالة */}
      <Dialog open={forwardOpen} onOpenChange={setForwardOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>اعتماد وإحالة لاعتماد ثانٍ</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              تُسجَّل موافقتك وتنتقل المهمة لاعتماد المدير الذي تختاره.
            </p>
            <Select value={forwardTo} onValueChange={setForwardTo}>
              <SelectTrigger>
                <SelectValue placeholder="اختر المدير" />
              </SelectTrigger>
              <SelectContent>
                {directors.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.short_name || d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="gold"
              disabled={!forwardTo || approveM.isPending}
              onClick={() =>
                approveM.mutate(
                  {
                    forwardTo,
                    fileId: latestFileId,
                    note: null,
                    taskTitle,
                    notifyIds,
                  },
                  { onSuccess: () => setForwardOpen(false) }
                )
              }
            >
              {approveM.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              اعتماد وإحالة
            </Button>
            <Button variant="outline" onClick={() => setForwardOpen(false)}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* إرجاع */}
      <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>إرجاع المهمة للعمل</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="return-note">الملاحظة — ما المطلوب تعديله؟ *</Label>
            <Textarea
              id="return-note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="destructive"
              disabled={note.trim() === '' || returnM.isPending}
              onClick={() =>
                returnM.mutate(
                  { note, taskTitle, notifyIds },
                  { onSuccess: () => setReturnOpen(false) }
                )
              }
            >
              {returnM.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              إرجاع للعمل
            </Button>
            <Button variant="outline" onClick={() => setReturnOpen(false)}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

/* ===================== قائمة التحقق ===================== */

function ChecklistCard({ taskId, readOnly }: { taskId: string; readOnly: boolean }) {
  const { data: subtasks } = useTaskSubtasks(taskId)
  const addM = useAddSubtask(taskId)
  const toggleM = useToggleSubtask(taskId)
  const deleteM = useDeleteSubtask(taskId)
  const [title, setTitle] = useState('')

  const list = subtasks ?? []
  // بلا بنود وبوضع القراءة — لا داعي لبطاقة فارغة
  if (list.length === 0 && readOnly) return null

  const doneCount = list.filter((s) => s.is_done).length

  const add = () => {
    if (title.trim() === '') return
    addM.mutate(title, { onSuccess: () => setTitle('') })
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold text-foreground">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gold/10">
            <CheckCircle2 className="h-[18px] w-[18px] text-gold" />
          </span>
          قائمة التحقق
          {list.length > 0 && (
            <span className="text-sm font-normal text-muted-foreground">
              ({fmtNumber(doneCount)}/{fmtNumber(list.length)})
            </span>
          )}
        </h3>

        {list.length > 0 && (
          <ul className="space-y-1">
            {list.map((s) => (
              <li key={s.id} className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-accent/5">
                <input
                  type="checkbox"
                  checked={s.is_done}
                  disabled={readOnly}
                  onChange={(e) => toggleM.mutate({ id: s.id, done: e.target.checked })}
                  className="h-4 w-4 shrink-0 cursor-pointer accent-gold"
                  aria-label={s.title}
                />
                <span
                  className={cn(
                    'flex-1 text-sm',
                    s.is_done ? 'text-muted-foreground line-through' : 'text-foreground'
                  )}
                >
                  {s.title}
                </span>
                {!readOnly && (
                  <button
                    onClick={() => deleteM.mutate(s.id)}
                    className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                    aria-label="حذف البند"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {!readOnly && (
          <div className="flex gap-2">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && add()}
              placeholder="بند جديد…"
              className="h-9"
            />
            <Button
              variant="outline"
              size="sm"
              className="h-9 shrink-0"
              disabled={title.trim() === '' || addM.isPending}
              onClick={add}
            >
              إضافة
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/* ===================== الخط الزمني ===================== */

function TimelineRow({
  item,
  taskId,
  myId,
  isDirector,
}: {
  item: TimelineItem
  taskId: string
  myId: string | null
  isDirector: boolean
}) {
  const deleteM = useDeleteComment(taskId)

  if (item.kind === 'file') {
    const f = item.file
    return (
      <li className="flex items-center gap-2 text-xs text-muted-foreground">
        <FileUp className="h-3.5 w-3.5 shrink-0 text-gold" />
        <span>
          رفع {f.uploader?.short_name || f.uploader?.name || 'موظف'}{' '}
          <a
            href={f.file_url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-foreground hover:text-gold"
          >
            النسخة {fmtNumber(f.version)}
          </a>
          {f.note && ` — ${f.note}`}
        </span>
        <span className="mr-auto shrink-0">{fmtDateTime(f.created_at)}</span>
      </li>
    )
  }

  if (item.kind === 'approval') {
    const a = item.approval
    const returned = a.action === 'returned'
    return (
      <li
        className={cn(
          'flex items-start gap-2 rounded-lg px-2 py-1.5 text-xs',
          returned ? 'bg-destructive/5 text-destructive' : 'text-muted-foreground'
        )}
      >
        <Stamp className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', returned ? '' : 'text-gold')} />
        <span className="min-w-0 flex-1">
          <span className="font-medium text-foreground">
            {a.actor?.short_name || a.actor?.name || 'موظف'}
          </span>{' '}
          {APPROVAL_ACTION_LABELS[a.action] ?? a.action}
          {a.action === 'forwarded' && a.forwardee && (
            <> إلى {a.forwardee.short_name || a.forwardee.name}</>
          )}
          {a.action === 'submitted' && a.forwardee && (
            <> — لاعتماد {a.forwardee.short_name || a.forwardee.name}</>
          )}
          {a.note && <span className="block text-muted-foreground">«{a.note}»</span>}
        </span>
        <span className="shrink-0">{fmtDateTime(a.created_at)}</span>
      </li>
    )
  }

  const c = item.comment
  const mine = c.author_id === myId
  return (
    <li className="group flex items-start gap-2.5">
      <MemberDot
        name={c.author?.name ?? null}
        color={c.author?.avatar_color}
        initial={c.author?.avatar_initial}
        size="sm"
      />
      <div className="min-w-0 flex-1 rounded-xl bg-muted/50 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-foreground">
            {c.author?.short_name || c.author?.name || 'موظف'}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {fmtDateTime(c.created_at)}
          </span>
          {(mine || isDirector) && (
            <button
              onClick={() => deleteM.mutate(c.id)}
              className="mr-auto text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
              aria-label="حذف التعليق"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
        <p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground">
          {renderMentions(c.body)}
        </p>
      </div>
    </li>
  )
}

// إبراز @المنشن داخل نص التعليق
function renderMentions(body: string) {
  const parts = body.split(/(@[\p{L}\p{N}_]+(?:\s[\p{L}\p{N}_]+)?)/u)
  return parts.map((p, i) =>
    p.startsWith('@') ? (
      <span key={i} className="font-semibold text-gold">
        {p}
      </span>
    ) : (
      <span key={i}>{p}</span>
    )
  )
}

/* ===================== كاتب التعليق بالمنشن ===================== */

function Composer({
  taskId,
  taskTitle,
  members,
}: {
  taskId: string
  taskTitle: string | null
  members: { id: string; name: string; short_name: string | null }[]
}) {
  const addM = useAddComment(taskId)
  const [body, setBody] = useState('')
  // من ذُكر فعلاً عبر القائمة — لا نخمّن من النص
  const [mentions, setMentions] = useState<Map<string, string>>(new Map())
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const areaRef = useRef<HTMLTextAreaElement>(null)

  const onChange = (v: string) => {
    setBody(v)
    // كشف «@نص» قيد الكتابة في نهاية النص قبل المؤشر
    const el = areaRef.current
    const upto = el ? v.slice(0, el.selectionStart ?? v.length) : v
    const m = upto.match(/@([\p{L}\p{N}_]*)$/u)
    setMentionQuery(m ? m[1] : null)
  }

  const pickMention = (member: { id: string; name: string; short_name: string | null }) => {
    const label = member.short_name || member.name
    const el = areaRef.current
    const pos = el?.selectionStart ?? body.length
    const before = body.slice(0, pos).replace(/@([\p{L}\p{N}_]*)$/u, `@${label} `)
    setBody(before + body.slice(pos))
    setMentions((s) => new Map(s).set(member.id, label))
    setMentionQuery(null)
    el?.focus()
  }

  const matches =
    mentionQuery !== null
      ? members
          .filter((m) =>
            (m.short_name || m.name).toLowerCase().includes(mentionQuery.toLowerCase())
          )
          .slice(0, 6)
      : []

  const send = () => {
    if (body.trim() === '') return
    // نُبقي فقط من ما زال اسمه موجوداً في النص (حُذف المنشن = لا إشعار)
    const ids = [...mentions.entries()]
      .filter(([, label]) => body.includes(`@${label}`))
      .map(([id]) => id)
    addM.mutate(
      { body, mentions: ids, taskTitle },
      {
        onSuccess: () => {
          setBody('')
          setMentions(new Map())
        },
      }
    )
  }

  return (
    <div className="relative border-t pt-3">
      {/* قائمة المنشن */}
      {matches.length > 0 && (
        <div className="absolute bottom-full right-0 z-10 mb-1 w-56 overflow-hidden rounded-xl border bg-card shadow-lg">
          {matches.map((m) => (
            <button
              key={m.id}
              className="flex w-full items-center gap-2 px-3 py-2 text-right text-sm hover:bg-accent/10"
              onClick={() => pickMention(m)}
            >
              <AtSign className="h-3.5 w-3.5 text-gold" />
              {m.short_name || m.name}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <Textarea
          ref={areaRef}
          rows={2}
          value={body}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send()
          }}
          placeholder="اكتب تعليقاً… استخدم @ لذكر موظف"
          className="min-h-[2.5rem] flex-1 resize-none"
        />
        <Button
          variant="gold"
          size="icon"
          className="h-10 w-10 shrink-0"
          disabled={body.trim() === '' || addM.isPending}
          onClick={send}
          aria-label="إرسال التعليق"
        >
          {addM.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  )
}
