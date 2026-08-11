// تفاصيل العقد: البيانات + الملف + المشاريع المرتبطة (قضايا/خدمات) وربطها
import { useState } from 'react'
import { useLocation, Link } from 'wouter'
import {
  ArrowRight,
  Pencil,
  Trash2,
  Handshake,
  FileText,
  ExternalLink,
  Scale,
  BookOpen,
  Link2,
  Unlink,
  Loader2,
  User,
  Phone,
  Sparkles,
  FileType2,
  CalendarClock,
  RotateCw,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertTitle } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
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
import { CasePicker } from '@/components/CasePicker'

import { fmtDatePref, fmtNumber, todayISO } from '@/lib/format'
import { useAuth } from '@/stores/auth'
import { useIsDirector } from '@/hooks/useIsDirector'
import { useCases } from '@/hooks/useCases'
import {
  useEngagement,
  useEngagementProjects,
  useUpdateEngagement,
  useDeleteEngagement,
  useLinkCaseToEngagement,
} from '@/hooks/useEngagements'
import { caseStatusBadge, caseStatusLabel } from '@/lib/caseLabels'
import { lsStatusBadge, lsStatusLabel, lsTypeLabel } from '@/lib/legalServiceLabels'
import {
  useEngagementDeadlines,
  useToggleDeadline,
  useDeleteDeadline,
  obligationTypeLabel,
} from '@/hooks/useDeadlines'
import { EngagementForm } from './EngagementForm'
import { ExtractContractDialog } from './ExtractContractDialog'
import { GenerateFromTemplateDialog } from './GenerateFromTemplateDialog'
import { ENG_STATUS_OPTIONS, engStatusBadge, engStatusLabel, engTypeLabel } from './labels'

export function EngagementDetail({ id }: { id: string }) {
  const [, navigate] = useLocation()
  const { teamMember } = useAuth()
  const isDirector = useIsDirector()
  const { data: e, isLoading, isError } = useEngagement(id)
  const { data: projects } = useEngagementProjects(id)
  const updateM = useUpdateEngagement()
  const deleteM = useDeleteEngagement()
  const linkM = useLinkCaseToEngagement(id)
  const { data: allCases } = useCases()
  const { data: obligations } = useEngagementDeadlines(id)
  const toggleDeadlineM = useToggleDeadline()
  const deleteDeadlineM = useDeleteDeadline()

  const [editOpen, setEditOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [pickedCase, setPickedCase] = useState<string | null>(null)
  const [unlinkFor, setUnlinkFor] = useState<{ id: string; title: string | null } | null>(null)
  const [extractOpen, setExtractOpen] = useState(false)
  const [generateOpen, setGenerateOpen] = useState(false)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (isError || !e) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate('/engagements')}>
          <ArrowRight className="h-4 w-4" />
          رجوع
        </Button>
        <Alert variant="destructive">
          <AlertTitle>تعذّر تحميل العقد</AlertTitle>
        </Alert>
      </div>
    )
  }

  const linkedCaseIds = new Set((projects?.cases ?? []).map((c) => c.id))
  // القضايا المتاحة للربط: غير مرتبطة بهذا العقد (ونرشّح قضايا نفس الموكّل أولاً بعرضها كلها)
  const linkableCases = (allCases ?? []).filter((c) => !linkedCaseIds.has(c.id))
  const projectsCount = (projects?.cases.length ?? 0) + (projects?.services.length ?? 0)

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" onClick={() => navigate('/engagements')}>
          <ArrowRight className="h-4 w-4" />
          رجوع للعقود
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
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Handshake className="h-5 w-5 shrink-0 text-gold" />
                <h2 className="text-xl font-bold text-foreground">{e.title}</h2>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Badge variant={engStatusBadge(e.status)}>
                  {engStatusLabel(e.status)}
                </Badge>
                {e.type && <Badge variant="outline">{engTypeLabel(e.type)}</Badge>}
                {e.engagement_number && (
                  <span
                    dir="ltr"
                    className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                  >
                    {e.engagement_number}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* مبدّل الحالة السريع */}
              <Select
                value={e.status}
                onValueChange={(v) => updateM.mutate({ id: e.id, input: { status: v } })}
              >
                <SelectTrigger className="h-9 w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENG_STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => setGenerateOpen(true)}>
                <FileType2 className="h-4 w-4" />
                توليد من قالب
              </Button>
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4" />
                تعديل
              </Button>
            </div>
          </div>

          {/* الموكّل */}
          {e.client && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t pt-3 text-sm">
              <Link
                href={`/contacts/${e.client.id}`}
                className="flex items-center gap-1.5 font-medium text-foreground hover:text-gold"
              >
                <User className="h-4 w-4 text-gold" />
                {e.client.name}
              </Link>
              {e.client.phone && (
                <span dir="ltr" className="flex items-center gap-1 text-muted-foreground">
                  <Phone className="h-3.5 w-3.5" />
                  {e.client.phone}
                </span>
              )}
            </div>
          )}

          {/* البيانات */}
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 border-t pt-4 sm:grid-cols-3">
            <Row label="تاريخ التوقيع" value={e.signed_date ? fmtDatePref(e.signed_date) : null} />
            <Row label="بداية السريان" value={e.start_date ? fmtDatePref(e.start_date) : null} />
            <Row label="نهاية السريان" value={e.end_date ? fmtDatePref(e.end_date) : null} />
            <Row
              label="إجمالي الأتعاب"
              value={e.fees_total != null ? `${fmtNumber(e.fees_total)} ريال` : null}
            />
            <Row label="طريقة الدفع" value={e.payment_terms} />
            <Row
              label="التجديد التلقائي"
              value={e.auto_renew == null ? null : e.auto_renew ? 'نعم' : 'لا'}
            />
            <Row
              label="مهلة الإشعار بالإنهاء"
              value={
                e.notice_period_days != null
                  ? `${fmtNumber(e.notice_period_days)} يوماً`
                  : null
              }
            />
          </dl>
          {(e.scope || e.notes) && (
            <dl className="grid grid-cols-1 gap-y-3 border-t pt-4">
              <Row label="نطاق العمل" value={e.scope} full />
              <Row label="ملاحظات" value={e.notes} full />
            </dl>
          )}
          {e.extract_summary && (
            <div className="rounded-xl bg-muted/50 p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-gold" />
                ملخّص العقد (استخراج آلي)
              </p>
              <p className="mt-1 text-sm leading-relaxed text-foreground">
                {e.extract_summary}
              </p>
            </div>
          )}

          {/* الملف */}
          {e.file_url && (
            <div className="flex flex-wrap gap-2 border-t pt-4">
              <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
                <FileText className="h-4 w-4" />
                معاينة العقد
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <a href={e.file_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  فتح/تنزيل
                </a>
              </Button>
              <Button
                variant="gold"
                size="sm"
                className="mr-auto"
                onClick={() => setExtractOpen(true)}
              >
                {e.extracted_at ? (
                  <RotateCw className="h-4 w-4" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {e.extracted_at ? 'إعادة استخراج البيانات' : 'استخراج البيانات من الملف'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* المشاريع المرتبطة */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="flex items-center gap-2.5 text-[15px] font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gold/10">
              <Scale className="h-[18px] w-[18px] text-gold" />
            </span>
            المشاريع المرتبطة
            {projectsCount > 0 && (
              <span className="text-sm font-normal text-muted-foreground">
                ({fmtNumber(projectsCount)})
              </span>
            )}
          </CardTitle>
          <Button variant="gold" size="sm" onClick={() => { setPickedCase(null); setLinkOpen(true) }}>
            <Link2 className="h-4 w-4" />
            ربط قضية
          </Button>
        </CardHeader>
        <CardContent>
          {projectsCount === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-10 text-center">
              <Scale className="mb-2 h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                لا مشاريع مرتبطة بعد — اربط قضية عبر «ربط قضية».
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/60 overflow-hidden rounded-xl border">
              {(projects?.cases ?? []).map((c) => (
                <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                  <Scale className="h-4 w-4 shrink-0 text-gold" />
                  <button
                    className="min-w-0 flex-1 text-right"
                    onClick={() => navigate(`/cases/${c.id}`)}
                  >
                    <p className="truncate text-sm font-medium text-foreground">
                      {c.title || 'قضية'}
                    </p>
                    {c.office_num && (
                      <p dir="ltr" className="truncate text-right text-xs text-muted-foreground">
                        {c.office_num}
                      </p>
                    )}
                  </button>
                  <Badge variant={caseStatusBadge(c.status)} className="shrink-0">
                    {caseStatusLabel(c.status)}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    title="فك الربط"
                    onClick={() => setUnlinkFor({ id: c.id, title: c.title })}
                  >
                    <Unlink className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {(projects?.services ?? []).map((s) => (
                <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                  <BookOpen className="h-4 w-4 shrink-0 text-gold" />
                  <button
                    className="min-w-0 flex-1 text-right"
                    onClick={() => navigate(`/legal-services/${s.id}`)}
                  >
                    <p className="truncate text-sm font-medium text-foreground">
                      {s.title || 'خدمة'}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {lsTypeLabel(s.type)}
                    </p>
                  </button>
                  <Badge variant={lsStatusBadge(s.status)} className="shrink-0">
                    {lsStatusLabel(s.status)}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* الالتزامات والمواعيد */}
      <Card>
        <CardHeader className="space-y-0">
          <CardTitle className="flex items-center gap-2.5 text-[15px] font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gold/10">
              <CalendarClock className="h-[18px] w-[18px] text-gold" />
            </span>
            الالتزامات والمواعيد
            {(obligations ?? []).length > 0 && (
              <span className="text-sm font-normal text-muted-foreground">
                ({fmtNumber((obligations ?? []).length)})
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(obligations ?? []).length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-10 text-center">
              <CalendarClock className="mb-2 h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                لا التزامات مسجَّلة
                {e.file_url
                  ? ' — استخرجها من ملف العقد بزر «استخراج البيانات».'
                  : ' — ارفع ملف العقد أولاً ليُستخرج منه.'}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border">
              {(obligations ?? []).map((o) => {
                const done = !!o.done
                const overdue = !done && o.deadline_date < todayISO()
                return (
                  <li key={o.id} className="flex items-start gap-3 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={done}
                      onChange={(ev) =>
                        toggleDeadlineM.mutate({ id: o.id, done: ev.target.checked })
                      }
                      aria-label={done ? 'إرجاع الالتزام' : 'إنجاز الالتزام'}
                      className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-gold"
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className={
                          done
                            ? 'text-sm text-muted-foreground line-through'
                            : 'text-sm font-medium text-foreground'
                        }
                      >
                        {o.title}
                      </p>
                      {o.notes && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{o.notes}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span
                        className={
                          overdue
                            ? 'text-xs font-medium text-destructive'
                            : 'text-xs text-muted-foreground'
                        }
                      >
                        {fmtDatePref(o.deadline_date)}
                        {overdue && ' — فات'}
                      </span>
                      <div className="flex items-center gap-1">
                        <Badge variant="outline" className="font-normal">
                          {obligationTypeLabel(o.type)}
                        </Badge>
                        {o.source === 'ai_contract' && (
                          <Sparkles className="h-3 w-3 text-gold" aria-label="استُخرج آلياً" />
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      title="حذف الالتزام"
                      onClick={() =>
                        deleteDeadlineM.mutate({
                          id: o.id,
                          deletedBy: teamMember?.name ?? null,
                        })
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ربط قضية */}
      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>ربط قضية بالعقد</DialogTitle>
          </DialogHeader>
          <CasePicker
            cases={linkableCases}
            value={pickedCase}
            onChange={setPickedCase}
          />
          <DialogFooter className="gap-2">
            <Button
              variant="gold"
              disabled={!pickedCase || linkM.isPending}
              onClick={() =>
                pickedCase &&
                linkM.mutate(
                  { caseId: pickedCase, link: true },
                  { onSuccess: () => setLinkOpen(false) }
                )
              }
            >
              {linkM.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              ربط
            </Button>
            <Button variant="outline" onClick={() => setLinkOpen(false)}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* فك الربط */}
      <AlertDialog open={!!unlinkFor} onOpenChange={(o) => !o && setUnlinkFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>فك ربط القضية</AlertDialogTitle>
            <AlertDialogDescription>
              ستُفصل «{unlinkFor?.title || 'القضية'}» عن هذا العقد (القضية نفسها لا
              تُحذف). متابعة؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (unlinkFor) linkM.mutate({ caseId: unlinkFor.id, link: false })
                setUnlinkFor(null)
              }}
            >
              فك الربط
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* تعديل */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <EngagementForm engagement={e} onDone={() => setEditOpen(false)} />
        </DialogContent>
      </Dialog>

      <ExtractContractDialog
        open={extractOpen}
        onOpenChange={setExtractOpen}
        engagement={e}
      />

      <GenerateFromTemplateDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        presets={{
          NAME: e.client?.name ?? '',
          PHONE: e.client?.phone ?? '',
          SCOPE: e.scope ?? '',
        }}
      />

      <FilePreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        fileUrl={e.file_url}
        fileName={e.title}
      />

      {/* حذف */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد حذف العقد</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف «{e.title}». يمكن استرجاعه لاحقاً من قِبل المدير، والقضايا
              المرتبطة لا تتأثر. هل أنت متأكد؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                deleteM.mutate(
                  { id: e.id, deletedBy: teamMember?.name ?? null },
                  { onSuccess: () => navigate('/engagements') }
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
    <div className={full ? 'sm:col-span-3' : ''}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap text-sm text-foreground">
        {value}
      </dd>
    </div>
  )
}
