import { useState } from 'react'
import { useLocation } from 'wouter'
import {
  ArrowRight,
  Phone,
  FileText,
  Award,
  Scale,
  Eye,
  ExternalLink,
  Trash2,
  UserCheck,
  XCircle,
  CheckCircle2,
  Users,
  type LucideIcon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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

import { fmtDate, fmtDateTime } from '@/lib/format'
import { openExternal } from '@/lib/external'
import { useAuth } from '@/stores/auth'
import { useIsDirector } from '@/hooks/useIsDirector'
import {
  useStaffApplication,
  useDeleteApplication,
} from '@/hooks/useStaffApplications'
import { ApproveDialog } from './ApproveDialog'
import { RejectDialog } from './RejectDialog'
import { appStatusBadge, appStatusLabel, idTypeLabel } from './labels'
import type { StaffApplication } from '@/types/db'

export function ApplicationDetail({ id }: { id: string }) {
  const [, navigate] = useLocation()
  const { teamMember } = useAuth()
  const isDirector = useIsDirector()
  const { data: a, isLoading, isError } = useStaffApplication(id)
  const deleteM = useDeleteApplication()

  const [preview, setPreview] = useState<{ url: string; name: string } | null>(
    null
  )
  const [approveOpen, setApproveOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (isError || !a) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate('/staff-applications')}>
          <ArrowRight className="h-4 w-4" />
          رجوع
        </Button>
        <Alert variant="destructive">
          <AlertTitle>تعذّر تحميل الطلب</AlertTitle>
          <AlertDescription>قد يكون محذوفاً أو غير متاح.</AlertDescription>
        </Alert>
      </div>
    )
  }

  const status = a.status ?? 'pending'

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" onClick={() => navigate('/staff-applications')}>
          <ArrowRight className="h-4 w-4" />
          رجوع للطلبات
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

      {/* الرأس */}
      <Card>
        <CardContent className="flex flex-wrap items-start justify-between gap-3 p-5">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-foreground">{a.full_name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              {a.phone && (
                <span dir="ltr" className="flex items-center gap-1">
                  <Phone className="h-3.5 w-3.5" />
                  {a.phone}
                </span>
              )}
              <span>قُدّم في {fmtDate(a.created_at)}</span>
            </div>
          </div>
          <Badge variant={appStatusBadge(status)}>
            {appStatusLabel(status)}
          </Badge>
        </CardContent>
      </Card>

      {/* شريط الإجراءات حسب الحالة */}
      <ActionBar
        app={a}
        onApprove={() => setApproveOpen(true)}
        onReject={() => setRejectOpen(true)}
        onGoTeam={() => navigate('/team')}
      />

      {/* الأقسام */}
      <Section title="بيانات شخصية">
        <Row label="الاسم الكامل" value={a.full_name} />
        <Row label="تاريخ الميلاد" value={fmtDate(a.date_of_birth)} />
        <Row label="نوع الهوية" value={idTypeLabel(a.id_type)} />
        <Row label="رقم الهوية" value={a.id_number} dir="ltr" />
        <Row label="الحالة الاجتماعية" value={a.marital_status} />
      </Section>

      <Section title="بيانات الاتصال">
        <Row label="الجوال" value={a.phone} dir="ltr" />
        <Row label="البريد الإلكتروني" value={a.email} dir="ltr" />
        <Row label="العنوان الوطني" value={a.national_address} />
      </Section>

      <Section title="المؤهلات">
        <Row label="المؤهلات" value={a.qualifications} full />
      </Section>

      <Section title="البيانات البنكية">
        <Row label="اسم البنك" value={a.bank_name} />
        <Row label="الآيبان" value={a.bank_iban} dir="ltr" />
      </Section>

      <Section title="جهة الطوارئ">
        <Row label="الاسم" value={a.emergency_contact_name} />
        <Row label="الجوال" value={a.emergency_contact_phone} dir="ltr" />
        <Row label="صلة القرابة" value={a.emergency_contact_relation} />
      </Section>

      {/* المرفقات */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">المرفقات</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Attachment
            icon={FileText}
            label="السيرة الذاتية"
            name={a.cv_name}
            url={a.cv_url}
            onPreview={setPreview}
          />
          <Attachment
            icon={Award}
            label="المؤهل الدراسي"
            name={a.qualification_doc_name}
            url={a.qualification_doc_url}
            onPreview={setPreview}
          />
          <Attachment
            icon={Scale}
            label="رخصة المحاماة"
            name={a.lawyer_license_name}
            url={a.lawyer_license_url}
            onPreview={setPreview}
          />
          {!a.cv_url && !a.qualification_doc_url && !a.lawyer_license_url && (
            <p className="py-3 text-center text-sm text-muted-foreground">
              لا توجد مرفقات.
            </p>
          )}
        </CardContent>
      </Card>

      {/* الحوارات */}
      <FilePreviewDialog
        open={!!preview}
        onOpenChange={(o) => !o && setPreview(null)}
        fileUrl={preview?.url ?? null}
        fileName={preview?.name ?? null}
      />
      {approveOpen && (
        <ApproveDialog
          application={a}
          open={approveOpen}
          onOpenChange={setApproveOpen}
        />
      )}
      <RejectDialog
        applicationId={a.id}
        open={rejectOpen}
        onOpenChange={setRejectOpen}
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد حذف الطلب</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف طلب «{a.full_name}». يمكن استرجاعه لاحقاً من قِبل المدير.
              هل أنت متأكد؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                deleteM.mutate(
                  { id: a.id, deletedBy: teamMember?.name ?? null },
                  { onSuccess: () => navigate('/staff-applications') }
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

function ActionBar({
  app: a,
  onApprove,
  onReject,
  onGoTeam,
}: {
  app: StaffApplication
  onApprove: () => void
  onReject: () => void
  onGoTeam: () => void
}) {
  const status = a.status ?? 'pending'

  if (status === 'pending') {
    return (
      <div className="flex flex-wrap gap-2">
        <Button variant="gold" onClick={onApprove}>
          <UserCheck className="h-4 w-4" />
          اعتماد وإنشاء حساب
        </Button>
        <Button variant="destructive" onClick={onReject}>
          <XCircle className="h-4 w-4" />
          رفض
        </Button>
      </div>
    )
  }

  if (status === 'approved') {
    return (
      <Alert>
        <CheckCircle2 className="h-4 w-4" />
        <AlertTitle>تم اعتماد الطلب</AlertTitle>
        <AlertDescription className="space-y-2">
          <p className="text-sm">
            {a.reviewed_by ? `اعتمده: ${a.reviewed_by}` : ''}
            {a.reviewed_at ? ` · ${fmtDateTime(a.reviewed_at)}` : ''}
          </p>
          <Button size="sm" variant="outline" onClick={onGoTeam}>
            <Users className="h-4 w-4" />
            عرض في الموظفين
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  // rejected
  return (
    <Alert variant="destructive">
      <XCircle className="h-4 w-4" />
      <AlertTitle>تم رفض الطلب</AlertTitle>
      <AlertDescription>
        {a.rejection_reason ? `السبب: ${a.rejection_reason}` : 'بدون سبب مذكور'}
        {a.reviewed_by ? ` — بواسطة ${a.reviewed_by}` : ''}
      </AlertDescription>
    </Alert>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {children}
        </dl>
      </CardContent>
    </Card>
  )
}

function Row({
  label,
  value,
  dir,
  full,
}: {
  label: string
  value: string | null | undefined
  dir?: 'ltr' | 'rtl'
  full?: boolean
}) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        dir={dir}
        className={
          'mt-0.5 whitespace-pre-wrap text-sm text-foreground ' +
          (dir === 'ltr' ? 'text-right' : '')
        }
      >
        {value && value.trim() !== '' ? value : '—'}
      </dd>
    </div>
  )
}

function Attachment({
  icon: Icon,
  label,
  name,
  url,
  onPreview,
}: {
  icon: LucideIcon
  label: string
  name: string | null
  url: string | null
  onPreview: (p: { url: string; name: string }) => void
}) {
  if (!url) return null
  const displayName = name || label
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-gold" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {label}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {displayName}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title="معاينة"
          onClick={() => onPreview({ url, name: displayName })}
        >
          <Eye className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title="فتح في تبويب جديد"
          onClick={() => openExternal(url)}
        >
          <ExternalLink className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
