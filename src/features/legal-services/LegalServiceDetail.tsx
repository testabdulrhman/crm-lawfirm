import { useState } from 'react'
import { useLocation, Link } from 'wouter'
import {
  ArrowRight,
  Pencil,
  Trash2,
  FileText,
  FileImage,
  File as FileIcon,
  BookUser,
  Paperclip,
  Plus,
  Eye,
  Loader2,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertTitle } from '@/components/ui/alert'
import { Dialog, DialogContent } from '@/components/ui/dialog'
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
import { FilePreviewDialog } from '@/components/FilePreviewDialog'
import { DropZone } from '@/components/DropZone'

import { toast } from '@/hooks/use-toast'
import { fmtDatePref, fmtNumber, fmtFileSize } from '@/lib/format'
import { pickFiles } from '@/lib/files'
import { useAuth } from '@/stores/auth'
import { useIsDirector } from '@/hooks/useIsDirector'
import {
  useLegalService,
  useUpdateLegalServiceStatus,
  useDeleteLegalService,
} from '@/hooks/useLegalServices'
import {
  useLegalServiceDocuments,
  useUploadLegalServiceDocuments,
  useDeleteLegalServiceDocument,
  MAX_LS_DOC_SIZE,
  type LegalServiceDocument,
} from '@/hooks/useLegalServiceDocuments'
import { LegalServiceForm } from './LegalServiceForm'
import {
  LS_STATUS_OPTIONS,
  lsStatusBadge,
  lsStatusLabel,
  lsTypeBadge,
  lsTypeLabel,
} from '@/lib/legalServiceLabels'

export function LegalServiceDetail({ id }: { id: string }) {
  const [, navigate] = useLocation()
  const { teamMember } = useAuth()
  const isDirector = useIsDirector()
  const { data: s, isLoading, isError } = useLegalService(id)
  const statusM = useUpdateLegalServiceStatus()
  const deleteM = useDeleteLegalService()

  const [editOpen, setEditOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (isError || !s) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate('/legal-services')}>
          <ArrowRight className="h-4 w-4" />
          رجوع
        </Button>
        <Alert variant="destructive">
          <AlertTitle>تعذّر تحميل الخدمة</AlertTitle>
        </Alert>
      </div>
    )
  }

  const isContract = s.type === 'contract'
  const isRegulation = s.type === 'regulation'

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" onClick={() => navigate('/legal-services')}>
          <ArrowRight className="h-4 w-4" />
          رجوع للخدمات
        </Button>
        {isDirector && (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="h-4 w-4" />
            حذف
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-foreground">{s.title}</h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Badge variant={lsTypeBadge(s.type)}>{lsTypeLabel(s.type)}</Badge>
                <Badge variant={lsStatusBadge(s.status)}>
                  {lsStatusLabel(s.status)}
                </Badge>
              </div>
            </div>
            <Select
              value={s.status ?? 'draft'}
              onValueChange={(v) => statusM.mutate({ id: s.id, status: v })}
            >
              <SelectTrigger className="h-9 w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LS_STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 border-t pt-4 sm:grid-cols-2">
            <Row label="الموكّل" value={s.client_name} />
            <Row label="نوع العمل" value={s.service_kind} />
            {isRegulation && <Row label="نوع اللائحة" value={s.regulation_type} />}
            {isContract && (
              <>
                <Row label="نوع العقد" value={s.contract_type} />
                <Row label="الطرف الأول" value={s.party_first} />
                <Row label="الطرف الثاني" value={s.party_second} />
              </>
            )}
            <Row label="المسؤول" value={s.assignee?.name || s.assignee_name} />
            <Row label="تاريخ الخدمة" value={s.service_date ? fmtDatePref(s.service_date) : null} />
            <Row label="تاريخ الاستلام" value={s.received_date ? fmtDatePref(s.received_date) : null} />
            <Row label="تاريخ التسليم" value={s.delivered_date ? fmtDatePref(s.delivered_date) : null} />
            <Row label="ملاحظات" value={s.notes} full />
          </dl>

          {/* روابط */}
          <div className="flex flex-wrap gap-2 border-t pt-4">
            {s.client_id && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/contacts/${s.client_id}`}>
                  <BookUser className="h-4 w-4" />
                  ملف الموكّل
                </Link>
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="mr-auto"
              onClick={() => setEditOpen(true)}
            >
              <Pencil className="h-4 w-4" />
              تعديل
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* المرفقات (متعددة) */}
      <LegalServiceDocumentsSection serviceId={s.id} />

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-xl">
          <LegalServiceForm service={s} onDone={() => setEditOpen(false)} />
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد حذف الخدمة</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف «{s.title}». يمكن استرجاعها لاحقاً من قِبل المدير. هل أنت
              متأكد؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                deleteM.mutate(
                  { id: s.id, deletedBy: teamMember?.name ?? null },
                  { onSuccess: () => navigate('/legal-services') }
                )
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

/* ===================== المرفقات (متعددة) ===================== */

function docIcon(d: LegalServiceDocument) {
  const t = `${d.file_type ?? ''} ${d.name ?? ''}`.toLowerCase()
  if (t.includes('pdf')) return FileText
  if (/(image|jpg|jpeg|png|webp|gif)/.test(t)) return FileImage
  return FileIcon
}

function LegalServiceDocumentsSection({ serviceId }: { serviceId: string }) {
  const { user } = useAuth()
  const isDirector = useIsDirector()
  const { data, isLoading } = useLegalServiceDocuments(serviceId)
  const uploadM = useUploadLegalServiceDocuments(serviceId)
  const deleteM = useDeleteLegalServiceDocument(serviceId)

  const [preview, setPreview] = useState<LegalServiceDocument | null>(null)
  const [toDelete, setToDelete] = useState<LegalServiceDocument | null>(null)

  // رفع دفعة (سحب وإفلات أو اختيار متعدد) مع استبعاد الكبيرة برسالة واضحة
  const uploadBatch = (files: File[]) => {
    if (files.length === 0 || uploadM.isPending) return
    const valid = files.filter((f) => f.size <= MAX_LS_DOC_SIZE)
    if (valid.length < files.length) {
      toast({
        variant: 'destructive',
        title: 'بعض الملفات كبيرة جداً',
        description: 'تم تجاهل ملفات تتجاوز 10 ميجابايت.',
      })
    }
    if (valid.length === 0) return
    uploadM.mutate({ files: valid, uploadedBy: user?.id ?? null })
  }

  const onUpload = async () => {
    uploadBatch(await pickFiles())
  }

  const docs = data ?? []

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Paperclip className="h-4 w-4 text-gold" />
          المرفقات
          {docs.length > 0 && (
            <span className="text-sm font-normal text-muted-foreground">
              ({fmtNumber(docs.length)})
            </span>
          )}
        </CardTitle>
        <Button
          variant="gold"
          size="sm"
          onClick={onUpload}
          disabled={uploadM.isPending}
        >
          {uploadM.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          رفع مرفقات
        </Button>
      </CardHeader>
      <CardContent>
        <DropZone
          onFiles={uploadBatch}
          uploadingCount={uploadM.isPending ? 1 : 0}
          hint="مستندات العمل — حتى ١٠ ميجابايت للملف"
          className="mb-4 py-5"
        />
        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-36 w-full" />
            ))}
          </div>
        ) : docs.length === 0 ? null : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {docs.map((d) => (
              <LsDocCard
                key={d.id}
                doc={d}
                isDirector={isDirector}
                onPreview={() => setPreview(d)}
                onDelete={() => setToDelete(d)}
              />
            ))}
          </div>
        )}
      </CardContent>

      <FilePreviewDialog
        open={!!preview}
        onOpenChange={(o) => !o && setPreview(null)}
        fileUrl={preview?.file_url ?? null}
        fileName={preview?.name ?? null}
      />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد حذف المرفق</AlertDialogTitle>
            <AlertDialogDescription>
              هل تريد حذف هذا المرفق «{toDelete?.name}»؟ يمكن استرجاعه لاحقاً من
              قِبل المدير.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (toDelete)
                  deleteM.mutate({ id: toDelete.id, deletedBy: user?.id ?? null })
                setToDelete(null)
              }}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

function LsDocCard({
  doc: d,
  isDirector,
  onPreview,
  onDelete,
}: {
  doc: LegalServiceDocument
  isDirector: boolean
  onPreview: () => void
  onDelete: () => void
}) {
  const Icon = docIcon(d)
  const meta = [
    d.created_at ? fmtDatePref(d.created_at) : null,
    fmtFileSize(d.file_size),
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Card className="flex flex-col">
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <button
          className="flex flex-1 flex-col items-center gap-2 text-center"
          onClick={onPreview}
          title="معاينة"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gold/10">
            <Icon className="h-6 w-6 text-gold" />
          </span>
          <p
            title={d.name}
            className="w-full truncate text-sm font-medium text-foreground"
          >
            {d.name}
          </p>
          {meta && (
            <p className="w-full truncate text-xs text-muted-foreground">
              {meta}
            </p>
          )}
        </button>

        <div className="mt-auto flex items-center justify-center gap-1 border-t pt-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="معاينة"
            onClick={onPreview}
          >
            <Eye className="h-4 w-4" />
          </Button>
          {isDirector && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive"
              title="حذف"
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function Row({
  label,
  value,
  full,
}: {
  label: string
  value: string | null | undefined
  full?: boolean
}) {
  if (!value || value.trim() === '') return null
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap text-sm text-foreground">{value}</dd>
    </div>
  )
}
