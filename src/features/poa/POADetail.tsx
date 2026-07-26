import { useState } from 'react'
import { useLocation, Link } from 'wouter'
import {
  ArrowRight,
  Pencil,
  Trash2,
  FileSignature,
  FileText,
  ExternalLink,
  BookUser,
  Scale,
  AlertTriangle,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
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

import { fmtDatePref } from '@/lib/format'
import { uploadFile } from '@/lib/files'
import { toast } from '@/hooks/use-toast'
import { useAuth } from '@/stores/auth'
import { useIsDirector } from '@/hooks/useIsDirector'
import {
  usePOA,
  useUpdatePOA,
  useUpdatePOAStatus,
  useDeletePOA,
} from '@/hooks/usePOAs'
import { DropZone } from '@/components/DropZone'
import { POAForm } from './POAForm'
import {
  POA_STATUS_OPTIONS,
  poaStatusBadge,
  poaStatusLabel,
  isExpiringSoon,
  isActuallyExpired,
  expirySoonText,
} from '@/lib/poaLabels'
import { errMessage } from '@/lib/errors'

export function POADetail({ id }: { id: string }) {
  const [, navigate] = useLocation()
  const { teamMember } = useAuth()
  const isDirector = useIsDirector()
  const { data: poa, isLoading, isError } = usePOA(id)
  const statusM = useUpdatePOAStatus()
  const deleteM = useDeletePOA()

  const [editOpen, setEditOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // رفع/استبدال مستند الوكالة بالإفلات
  const updateM = useUpdatePOA()
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const onDocFile = async (files: File[]) => {
    const f = files[0]
    if (!f || uploadingDoc) return
    setUploadingDoc(true)
    try {
      const { publicUrl } = await uploadFile(f, { folder: `poa/${id}` })
      await updateM.mutateAsync({ id, input: { document_url: publicUrl } })
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'تعذّر رفع مستند الوكالة',
        description: errMessage(e),
      })
    } finally {
      setUploadingDoc(false)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (isError || !poa) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate('/poa')}>
          <ArrowRight className="h-4 w-4" />
          رجوع
        </Button>
        <Alert variant="destructive">
          <AlertTitle>تعذّر تحميل الوكالة</AlertTitle>
        </Alert>
      </div>
    )
  }

  const soon = isExpiringSoon(poa)
  const overdue = isActuallyExpired(poa)

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" onClick={() => navigate('/poa')}>
          <ArrowRight className="h-4 w-4" />
          رجوع للوكالات
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
              <div className="flex items-center gap-2">
                <FileSignature className="h-5 w-5 shrink-0 text-gold" />
                <h2 className="text-xl font-bold text-foreground">
                  {poa.poa_number || 'وكالة'}
                </h2>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Badge variant={poaStatusBadge(poa.status)}>
                  {poaStatusLabel(poa.status)}
                </Badge>
                {soon && (
                  <Badge variant="warning" className="gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {expirySoonText(poa.expiry_date)}
                  </Badge>
                )}
                {overdue && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    منتهية فعلياً
                  </Badge>
                )}
              </div>
            </div>
            {/* مبدّل الحالة */}
            <Select
              value={poa.status ?? 'active'}
              onValueChange={(v) => statusM.mutate({ id: poa.id, status: v })}
            >
              <SelectTrigger className="h-9 w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {POA_STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 border-t pt-4 sm:grid-cols-2">
            <Row label="الموكّل" value={poa.client_name} />
            <Row label="الوكيل" value={poa.agent_name} />
            <Row label="تاريخ الإصدار" value={poa.poa_date ? fmtDatePref(poa.poa_date) : null} />
            <Row
              label="تاريخ الانتهاء"
              value={poa.expiry_date ? fmtDatePref(poa.expiry_date) : null}
            />
            <Row label="ملاحظات" value={poa.notes} full />
          </dl>

          {/* روابط */}
          <div className="flex flex-wrap gap-2">
            {poa.client_id && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/contacts/${poa.client_id}`}>
                  <BookUser className="h-4 w-4" />
                  ملف الموكّل
                </Link>
              </Button>
            )}
            {poa.case_id && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/cases/${poa.case_id}`}>
                  <Scale className="h-4 w-4" />
                  {poa.case?.title || 'القضية المرتبطة'}
                </Link>
              </Button>
            )}
          </div>

          {/* المستند */}
          <div className="space-y-3 border-t pt-4">
            {poa.document_url && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
                  <FileText className="h-4 w-4" />
                  معاينة المستند
                </Button>
                <Button variant="ghost" size="sm" asChild>
                  <a href={poa.document_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    فتح/تنزيل
                  </a>
                </Button>
              </div>
            )}
            <DropZone
              multiple={false}
              onFiles={onDocFile}
              uploadingCount={uploadingDoc ? 1 : 0}
              hint={
                poa.document_url
                  ? 'إفلات ملف جديد يستبدل مستند الوكالة الحالي'
                  : 'أضف صورة أو ملف الوكالة'
              }
              className="py-4"
            />
          </div>

          <div className="flex justify-end border-t pt-4">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" />
              تعديل
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* الحوارات */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-xl">
          <POAForm poa={poa} onDone={() => setEditOpen(false)} />
        </DialogContent>
      </Dialog>

      <FilePreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        fileUrl={poa.document_url}
        fileName={`وكالة ${poa.poa_number ?? ''}`}
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد حذف الوكالة</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف الوكالة «{poa.poa_number || poa.client_name || ''}». يمكن
              استرجاعها لاحقاً من قِبل المدير. هل أنت متأكد؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                deleteM.mutate(
                  { id: poa.id, deletedBy: teamMember?.name ?? null },
                  { onSuccess: () => navigate('/poa') }
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
