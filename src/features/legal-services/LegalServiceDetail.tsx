import { useState } from 'react'
import { useLocation, Link } from 'wouter'
import {
  ArrowRight,
  Pencil,
  Trash2,
  FileText,
  BookUser,
  ExternalLink,
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
import { useAuth } from '@/stores/auth'
import { useIsDirector } from '@/hooks/useIsDirector'
import {
  useLegalService,
  useUpdateLegalServiceStatus,
  useDeleteLegalService,
} from '@/hooks/useLegalServices'
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
  const [previewOpen, setPreviewOpen] = useState(false)
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
    <div className="mx-auto max-w-3xl space-y-5">
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

          {/* روابط + ملف */}
          <div className="flex flex-wrap gap-2 border-t pt-4">
            {s.client_id && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/contacts/${s.client_id}`}>
                  <BookUser className="h-4 w-4" />
                  ملف الموكّل
                </Link>
              </Button>
            )}
            {s.file_url && (
              <>
                <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
                  <FileText className="h-4 w-4" />
                  معاينة الملف
                </Button>
                <Button variant="ghost" size="sm" asChild>
                  <a href={s.file_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    فتح/تنزيل
                  </a>
                </Button>
              </>
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

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-xl">
          <LegalServiceForm service={s} onDone={() => setEditOpen(false)} />
        </DialogContent>
      </Dialog>

      <FilePreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        fileUrl={s.file_url}
        fileName={s.file_name || s.title}
      />

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
