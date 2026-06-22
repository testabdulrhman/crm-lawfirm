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
  RotateCcw,
  Loader2,
  Sparkles,
  Check,
  AlertTriangle,
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

import { fmtDatePref, fmtDateTime, fmtNumber } from '@/lib/format'
import { openExternal } from '@/lib/external'
import { useAuth } from '@/stores/auth'
import { useIsDirector } from '@/hooks/useIsDirector'
import { useAnalyzeApplicant } from '@/hooks/useAiAnalysis'
import type { ApplicantAnalysis } from '@/hooks/useAiAnalysis'
import {
  useStaffApplication,
  useDeleteApplication,
  useReopenApplication,
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
  const reopenM = useReopenApplication()

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
              <span>قُدّم في {fmtDatePref(a.created_at)}</span>
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
        onReopen={() => reopenM.mutate(a.id)}
        reopening={reopenM.isPending}
      />

      {/* تحليل بالذكاء الاصطناعي */}
      <AiAnalysisCard app={a} />

      {/* الأقسام */}
      <Section title="بيانات شخصية">
        <Row label="الاسم الكامل" value={a.full_name} />
        <Row label="تاريخ الميلاد" value={fmtDatePref(a.date_of_birth)} />
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
        application={a}
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
  onReopen,
  reopening,
}: {
  app: StaffApplication
  onApprove: () => void
  onReject: () => void
  onGoTeam: () => void
  onReopen: () => void
  reopening: boolean
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
      <AlertDescription className="space-y-2">
        <p>
          {a.rejection_reason ? `السبب: ${a.rejection_reason}` : 'بدون سبب مذكور'}
          {a.reviewed_by ? ` — بواسطة ${a.reviewed_by}` : ''}
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={onReopen}
          disabled={reopening}
        >
          {reopening ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RotateCcw className="h-4 w-4" />
          )}
          إعادة الطلب للمراجعة
        </Button>
      </AlertDescription>
    </Alert>
  )
}

/* ===================== تحليل بالذكاء الاصطناعي ===================== */

function AiAnalysisCard({ app: a }: { app: StaffApplication }) {
  const analyzeM = useAnalyzeApplicant()
  const result = analyzeM.data
  const hasResult = !!result

  const run = () =>
    analyzeM.mutate({
      full_name: a.full_name,
      qualifications: a.qualifications,
      email: a.email,
    })

  return (
    <Card className="border-violet-200 bg-violet-50/50 dark:border-violet-900/40 dark:bg-violet-950/20">
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-violet-500" />
          تحليل بالذكاء الاصطناعي
        </CardTitle>
        {hasResult && (
          <Button
            size="sm"
            variant="outline"
            onClick={run}
            disabled={analyzeM.isPending}
          >
            {analyzeM.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}
            إعادة التحليل
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {!hasResult && !analyzeM.isPending && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              احصل على تحليل سريع لمساعدتك في فرز هذا المتقدّم.
            </p>
            <Button
              variant="gold"
              onClick={run}
              className="bg-violet-600 text-white hover:bg-violet-700"
            >
              <Sparkles className="h-4 w-4" />
              تحليل بالذكاء الاصطناعي
            </Button>
          </div>
        )}

        {analyzeM.isPending && (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-violet-500" />
            جارٍ التحليل...
          </div>
        )}

        {hasResult && !analyzeM.isPending && (
          <>
            {result.parsed ? (
              <AnalysisResult data={result.parsed} />
            ) : (
              <div className="whitespace-pre-wrap rounded-lg border bg-background/60 p-3 text-sm leading-relaxed text-foreground">
                {result.text || 'لا توجد نتيجة.'}
              </div>
            )}

            <p className="border-t pt-3 text-xs text-muted-foreground">
              هذا تحليل مبدئي بالذكاء الاصطناعي للمساعدة في الفرز، والقرار النهائي
              لك.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function scoreTone(score: number): {
  bar: string
  track: string
  text: string
} {
  if (score < 4)
    return {
      bar: 'bg-red-500',
      track: 'bg-red-500/15',
      text: 'text-red-600 dark:text-red-400',
    }
  if (score <= 6)
    return {
      bar: 'bg-amber-500',
      track: 'bg-amber-500/15',
      text: 'text-amber-600 dark:text-amber-400',
    }
  return {
    bar: 'bg-emerald-500',
    track: 'bg-emerald-500/15',
    text: 'text-emerald-600 dark:text-emerald-400',
  }
}

function AnalysisResult({ data }: { data: ApplicantAnalysis }) {
  const score = Math.max(0, Math.min(10, Number(data.fit_score) || 0))
  const tone = scoreTone(score)

  return (
    <div className="space-y-4">
      {/* مؤشّر الملاءمة + الوظيفة المقترحة */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="min-w-[10rem] flex-1">
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>مؤشّر الملاءمة</span>
            <span className={'font-bold ' + tone.text} dir="ltr">
              {fmtNumber(score)}/10
            </span>
          </div>
          <div className={'h-2.5 w-full overflow-hidden rounded-full ' + tone.track}>
            <div
              className={'h-full rounded-full transition-all ' + tone.bar}
              style={{ width: `${score * 10}%` }}
            />
          </div>
        </div>
        {data.suggested_role && (
          <div className="shrink-0">
            <p className="mb-1 text-xs text-muted-foreground">الوظيفة المقترحة</p>
            <Badge className="bg-violet-600 text-white hover:bg-violet-600">
              {data.suggested_role}
            </Badge>
          </div>
        )}
      </div>

      {/* الملخّص */}
      {data.summary && (
        <div>
          <p className="mb-1 text-xs font-semibold text-muted-foreground">
            الملخّص
          </p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {data.summary}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* نقاط القوة */}
        {data.strengths?.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
              نقاط القوة
            </p>
            <ul className="space-y-1.5">
              {data.strengths.map((s, i) => (
                <li key={i} className="flex items-start gap-1.5 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  <span className="text-foreground">{s}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ملاحظات */}
        {data.concerns?.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
              ملاحظات
            </p>
            <ul className="space-y-1.5">
              {data.concerns.map((s, i) => (
                <li key={i} className="flex items-start gap-1.5 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <span className="text-foreground">{s}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* التوصية */}
      {data.recommendation && (
        <div className="rounded-lg border border-violet-200 bg-violet-100/50 p-3 dark:border-violet-900/40 dark:bg-violet-950/30">
          <p className="mb-0.5 text-xs font-semibold text-violet-600 dark:text-violet-300">
            التوصية
          </p>
          <p className="text-sm font-medium text-foreground">
            {data.recommendation}
          </p>
        </div>
      )}
    </div>
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
