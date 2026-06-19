import { useState } from 'react'
import { useLocation } from 'wouter'
import {
  ArrowRight,
  Phone,
  CalendarDays,
  UserCog,
  Paperclip,
  Upload,
  ExternalLink,
  Trash2,
  Pencil,
  Plus,
  FileText,
  Check,
  X,
  Clock,
  Loader2,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import { FilePreviewDialog } from '@/components/FilePreviewDialog'

import { fmtDate } from '@/lib/format'
import { pickFile } from '@/lib/files'
import { openExternal } from '@/lib/external'
import { useAuth } from '@/stores/auth'
import { useIsDirector } from '@/hooks/useIsDirector'
import { useTeamMembers } from '@/hooks/useTeam'
import {
  useRequest,
  useAssignRequest,
  useDecideRequest,
  useAddRequestDocument,
  useDeleteRequestDocument,
  useDeleteEvaluation,
} from '@/hooks/useRequests'
import { EvaluationForm } from './EvaluationForm'
import { statusBadgeVariant, statusLabel, typeLabel } from './labels'
import type { RequestDocument, RequestEvaluation } from '@/types/db'

export function RequestDetail({ id }: { id: string }) {
  const [, navigate] = useLocation()
  const { data, isLoading, isError } = useRequest(id)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate('/requests')}>
          <ArrowRight className="h-4 w-4" />
          رجوع
        </Button>
        <Alert variant="destructive">
          <AlertTitle>تعذّر تحميل الطلب</AlertTitle>
          <AlertDescription>قد يكون الطلب محذوفاً أو غير متاح.</AlertDescription>
        </Alert>
      </div>
    )
  }

  const { request: r, evaluations, documents } = data

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Button variant="ghost" onClick={() => navigate('/requests')}>
        <ArrowRight className="h-4 w-4" />
        رجوع للطلبات
      </Button>

      {/* الرأس */}
      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-foreground">
                {r.client_name}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                {r.client_phone && (
                  <span dir="ltr" className="flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" />
                    {r.client_phone}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {fmtDate(r.received_at)}
                </span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Badge variant={statusBadgeVariant(r.status)}>
                {statusLabel(r.status)}
              </Badge>
              <Badge variant="outline">{typeLabel(r.request_type)}</Badge>
            </div>
          </div>
          {r.created_by && (
            <p className="text-xs text-muted-foreground">
              أنشأه: {r.created_by}
            </p>
          )}
        </CardContent>
      </Card>

      {/* الإسناد + القرار */}
      <div className="grid gap-4 md:grid-cols-2">
        <AssignmentCard requestId={r.id} currentName={r.assigned_to_name} />
        <DecisionCard
          requestId={r.id}
          status={r.status}
          decisionAt={r.decision_at}
          decisionBy={r.decision_by}
          rejectionReason={r.rejection_reason}
        />
      </div>

      {/* الوصف */}
      {r.description && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">الوصف</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {r.description}
            </p>
          </CardContent>
        </Card>
      )}

      {/* التقييمات */}
      <EvaluationsSection requestId={r.id} evaluations={evaluations} />

      {/* المرفقات */}
      <DocumentsSection requestId={r.id} documents={documents} />
    </div>
  )
}

/* ===================== الإسناد ===================== */

function AssignmentCard({
  requestId,
  currentName,
}: {
  requestId: string
  currentName: string | null
}) {
  const { data: members } = useTeamMembers()
  const assignM = useAssignRequest()
  const [value, setValue] = useState<string>('')

  const active = (members ?? []).filter((m) => m.is_active)

  const onAssign = (memberId: string) => {
    setValue(memberId)
    const m = active.find((x) => x.id === memberId)
    if (m) {
      assignM.mutate({
        id: requestId,
        assignedToId: m.id,
        assignedToName: m.name,
      })
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <UserCog className="h-4 w-4 text-gold" />
        <CardTitle className="text-base">المحامي المسؤول</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">
          {currentName ? (
            <span className="font-medium text-foreground">{currentName}</span>
          ) : (
            <span className="text-muted-foreground">غير مُسند</span>
          )}
        </p>
        <Select value={value} onValueChange={onAssign}>
          <SelectTrigger>
            <SelectValue placeholder={currentName ? 'تغيير المحامي' : 'إسناد محامٍ'} />
          </SelectTrigger>
          <SelectContent>
            {active.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  )
}

/* ===================== القرار ===================== */

function DecisionCard({
  requestId,
  status,
  decisionAt,
  decisionBy,
  rejectionReason,
}: {
  requestId: string
  status: string | null
  decisionAt: string | null
  decisionBy: string | null
  rejectionReason: string | null
}) {
  const { teamMember } = useAuth()
  const decideM = useDecideRequest()
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState('')

  const decide = (
    s: 'accepted' | 'rejected' | 'deferred',
    rejReason?: string
  ) => {
    decideM.mutate({
      id: requestId,
      status: s,
      decisionBy: teamMember?.name ?? '—',
      rejectionReason: rejReason,
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">القرار</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {status && status !== 'under_review' && (
          <div className="rounded-lg bg-muted/50 p-3 text-sm">
            <p>
              الحالة الحالية:{' '}
              <Badge variant={statusBadgeVariant(status)}>
                {statusLabel(status)}
              </Badge>
            </p>
            {decisionAt && (
              <p className="mt-1 text-xs text-muted-foreground">
                بتاريخ {fmtDate(decisionAt)}
                {decisionBy ? ` · بواسطة ${decisionBy}` : ''}
              </p>
            )}
            {rejectionReason && (
              <p className="mt-1 text-xs text-destructive">
                سبب الرفض: {rejectionReason}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="default"
            className="bg-emerald-600 hover:bg-emerald-700"
            disabled={decideM.isPending}
            onClick={() => decide('accepted')}
          >
            <Check className="h-4 w-4" />
            قبول
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={decideM.isPending}
            onClick={() => setRejectOpen(true)}
          >
            <X className="h-4 w-4" />
            رفض
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={decideM.isPending}
            onClick={() => decide('deferred')}
          >
            <Clock className="h-4 w-4" />
            تأجيل
          </Button>
        </div>

        {/* تحويل لقضية: يتوفّر في وحدة القضايا لاحقاً */}
        <Button size="sm" variant="ghost" disabled className="w-full">
          تحويل لقضية (يتوفّر في وحدة القضايا)
        </Button>
      </CardContent>

      {/* نافذة سبب الرفض */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>سبب الرفض</DialogTitle>
          </DialogHeader>
          <div className="my-3 space-y-1.5">
            <Label htmlFor="reason">اذكر سبب رفض الطلب</Label>
            <Textarea
              id="reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="destructive"
              disabled={decideM.isPending || reason.trim() === ''}
              onClick={() => {
                decide('rejected', reason.trim())
                setRejectOpen(false)
                setReason('')
              }}
            >
              تأكيد الرفض
            </Button>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

/* ===================== التقييمات ===================== */

function EvaluationsSection({
  requestId,
  evaluations,
}: {
  requestId: string
  evaluations: RequestEvaluation[]
}) {
  const deleteM = useDeleteEvaluation()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<RequestEvaluation | null>(null)

  const openNew = () => {
    setEditing(null)
    setOpen(true)
  }
  const openEdit = (e: RequestEvaluation) => {
    setEditing(e)
    setOpen(true)
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">
          التقييمات{' '}
          <span className="text-sm text-muted-foreground">
            ({evaluations.length})
          </span>
        </CardTitle>
        <Button size="sm" variant="gold" onClick={openNew}>
          <Plus className="h-4 w-4" />
          تقييم
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {evaluations.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            لا توجد تقييمات بعد.
          </p>
        ) : (
          evaluations.map((e) => (
            <div key={e.id} className="rounded-lg border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">
                    {e.evaluator_name ?? 'مقيّم'}
                  </span>
                  {e.recommendation && (
                    <Badge variant="gold">{e.recommendation}</Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">
                    {fmtDate(e.created_at)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => openEdit(e)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => deleteM.mutate(e.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              {e.summary && <p className="mt-2 text-sm">{e.summary}</p>}
              <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                {e.strengths && (
                  <p className="text-emerald-700 dark:text-emerald-300">
                    <span className="font-medium">قوة: </span>
                    {e.strengths}
                  </p>
                )}
                {e.weaknesses && (
                  <p className="text-destructive">
                    <span className="font-medium">ضعف: </span>
                    {e.weaknesses}
                  </p>
                )}
              </div>
              {e.notes && (
                <p className="mt-1 text-xs text-muted-foreground">{e.notes}</p>
              )}
            </div>
          ))
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <EvaluationForm
            requestId={requestId}
            evaluation={editing}
            onDone={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </Card>
  )
}

/* ===================== المرفقات ===================== */

function DocumentsSection({
  requestId,
  documents,
}: {
  requestId: string
  documents: RequestDocument[]
}) {
  const { teamMember } = useAuth()
  const isDirector = useIsDirector()
  const addM = useAddRequestDocument()
  const deleteM = useDeleteRequestDocument()

  // معاينة
  const [preview, setPreview] = useState<RequestDocument | null>(null)
  // تأكيد الحذف
  const [toDelete, setToDelete] = useState<RequestDocument | null>(null)

  const onUpload = async () => {
    const file = await pickFile()
    if (file) addM.mutate({ requestId, file })
  }

  const confirmDelete = () => {
    if (toDelete) {
      deleteM.mutate({ id: toDelete.id, deletedBy: teamMember?.name ?? null })
      setToDelete(null)
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Paperclip className="h-4 w-4" />
          المرفقات{' '}
          <span className="text-sm text-muted-foreground">
            ({documents.length})
          </span>
        </CardTitle>
        <Button
          size="sm"
          variant="gold"
          onClick={onUpload}
          disabled={addM.isPending}
        >
          {addM.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          رفع
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {documents.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            لا توجد مرفقات.
          </p>
        ) : (
          documents.map((d) => (
            <div
              key={d.id}
              className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
            >
              {/* النقر على الاسم يفتح المعاينة داخل النظام */}
              <button
                className="flex min-w-0 items-center gap-2 text-sm hover:text-gold"
                onClick={() => setPreview(d)}
              >
                <FileText className="h-4 w-4 shrink-0" />
                <span className="truncate">{d.name ?? 'ملف'}</span>
              </button>
              <div className="flex items-center gap-1">
                {/* فتح في تبويب جديد كخيار ثانوي */}
                {d.file_url && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title="فتح في تبويب جديد"
                    onClick={() => openExternal(d.file_url!)}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                )}
                {/* الحذف للمدير فقط */}
                {isDirector && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    title="حذف"
                    onClick={() => setToDelete(d)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </CardContent>

      {/* معاينة الملف */}
      <FilePreviewDialog
        open={!!preview}
        onOpenChange={(o) => !o && setPreview(null)}
        fileUrl={preview?.file_url ?? null}
        fileName={preview?.name ?? null}
      />

      {/* تأكيد الحذف */}
      <AlertDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد حذف المرفق</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف الملف: «{toDelete?.name ?? 'ملف'}». يمكن استرجاعه لاحقاً
              من قِبل المدير. هل أنت متأكد؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
