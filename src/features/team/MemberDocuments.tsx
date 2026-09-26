// مرفقات الموظف واكتمال ملفه (طلب المدير 2026-09-26): ثلاثة مطلوبة — الهوية الوطنية ووثيقة
// البكالوريوس والصورة الشخصية — ومعها ما شاء من مرفقات أخرى. الاكتمال يحسب البيانات والمرفقات معاً.
import { useState } from 'react'
import {
  BadgeCheck,
  CheckCircle2,
  Circle,
  Eye,
  FileText,
  IdCard,
  ImageIcon,
  GraduationCap,
  Loader2,
  Paperclip,
  Plus,
  RefreshCw,
  Trash2,
  type LucideIcon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useConfirm } from '@/components/ConfirmDialog'
import { cn } from '@/lib/utils'
import { fmtDatePref, fmtNumber } from '@/lib/format'
import { pickFile } from '@/lib/files'
import { errMessage } from '@/lib/errors'
import { toast } from '@/hooks/use-toast'
import {
  MEMBER_DOC_LABELS,
  memberDocUrl,
  useDeleteMemberDoc,
  useMemberDocuments,
  useUpdateMemberPhoto,
  useUploadMemberDoc,
  type MemberDocType,
  type MemberDocument,
} from '@/hooks/useMemberDocuments'
import type { TeamMember } from '@/types/db'

/* ===== الاكتمال ===== */

export const PROFILE_FIELDS: { key: keyof TeamMember; label: string }[] = [
  { key: 'phone', label: 'الجوال' },
  { key: 'email', label: 'البريد' },
  { key: 'id_number', label: 'رقم الهوية' },
  { key: 'date_of_birth', label: 'تاريخ الميلاد' },
  { key: 'join_date', label: 'تاريخ التعيين' },
  { key: 'national_address', label: 'العنوان الوطني' },
  { key: 'qualifications', label: 'المؤهلات' },
  { key: 'emergency_contact_name', label: 'جهة الطوارئ' },
  { key: 'emergency_contact_phone', label: 'جوال الطوارئ' },
  { key: 'bank_name', label: 'البنك' },
  { key: 'bank_iban', label: 'الآيبان' },
]

type RequiredDoc = 'national_id' | 'degree' | 'license' | 'photo'
const REQUIRED: { key: RequiredDoc; label: string; icon: LucideIcon; hint: string }[] = [
  { key: 'national_id', label: 'الهوية الوطنية', icon: IdCard, hint: 'صورة أو PDF للوجهين' },
  { key: 'degree', label: 'وثيقة البكالوريوس', icon: GraduationCap, hint: 'الشهادة أو وثيقة التخرج' },
  // أُضيف بطلب المدير 2026-09-26: «من ضمن المرفقات المطلوبة للموظف الترخيص»
  { key: 'license', label: 'الترخيص', icon: BadgeCheck, hint: 'رخصة المحاماة أو التدريب' },
  { key: 'photo', label: 'الصورة الشخصية', icon: ImageIcon, hint: 'تظهر صورةً له في النظام كله' },
]

export function memberCompleteness(member: TeamMember, docs: MemberDocument[] | undefined) {
  const missingFields = PROFILE_FIELDS.filter((f) => !member[f.key]).map((f) => f.label)
  const has = (t: MemberDocType) => (docs ?? []).some((d) => d.doc_type === t)
  const docState: Record<RequiredDoc, boolean> = {
    national_id: has('national_id'),
    // شهادة رُفعت مع طلب التوظيف تُحتسب
    degree: has('degree') || !!member.qualification_doc_url,
    license: has('license') || !!member.lawyer_license_url,
    photo: !!member.avatar_url,
  }
  const missingDocs = REQUIRED.filter((r) => !docState[r.key]).map((r) => r.label)
  const total = PROFILE_FIELDS.length + REQUIRED.length
  const done = total - missingFields.length - missingDocs.length
  return { pct: Math.round((done / total) * 100), missingFields, missingDocs, docState }
}

/* ===== البطاقة ===== */

export function MemberDocumentsSection({
  member,
  canEdit,
  isDirector,
  onEdit,
  onPreview,
}: {
  member: TeamMember
  canEdit: boolean
  isDirector: boolean
  onEdit: () => void
  onPreview: (url: string, name: string) => void
}) {
  const { data: docs, isLoading } = useMemberDocuments(member.id)
  const upload = useUploadMemberDoc()
  const del = useDeleteMemberDoc()
  const photo = useUpdateMemberPhoto()
  const { confirm, dialog } = useConfirm()
  const [busy, setBusy] = useState<string | null>(null)
  const c = memberCompleteness(member, docs)

  const latest = (t: MemberDocType) => (docs ?? []).find((d) => d.doc_type === t)
  const others = (docs ?? []).filter((d) => !['national_id', 'degree', 'license'].includes(d.doc_type))

  const open = async (d: MemberDocument) => {
    try {
      onPreview(await memberDocUrl(d.file_path), d.file_name || MEMBER_DOC_LABELS[d.doc_type])
    } catch (e) {
      toast({ variant: 'destructive', title: 'تعذّر فتح المرفق', description: errMessage(e) })
    }
  }

  const pickAndUpload = async (t: MemberDocType | 'photo') => {
    const f = await pickFile({ accept: t === 'photo' ? 'image/*' : 'image/*,application/pdf' })
    if (!f) return
    if (f.size > 20 * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'الملف أكبر من 20 م.ب' })
      return
    }
    setBusy(t)
    try {
      if (t === 'photo') await photo.mutateAsync({ memberId: member.id, file: f })
      else await upload.mutateAsync({ memberId: member.id, docType: t, file: f })
    } catch {
      /* التوست في الخطّاف */
    } finally {
      setBusy(null)
    }
  }

  const remove = (d: MemberDocument) =>
    confirm({
      title: 'حذف المرفق',
      description: `سيُحذف «${d.file_name || MEMBER_DOC_LABELS[d.doc_type]}» نهائياً. متابعة؟`,
      onConfirm: () => del.mutate(d),
    })

  return (
    <div className="space-y-4">
      {/* الاكتمال */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-4">
            <div
              className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full"
              style={{
                background: `conic-gradient(${c.pct === 100 ? '#10b981' : '#C9A982'} ${c.pct * 3.6}deg, hsl(var(--muted)) 0deg)`,
              }}
            >
              <span dir="ltr" className="flex h-12 w-12 items-center justify-center rounded-full bg-card text-sm font-bold text-foreground">
                {fmtNumber(c.pct)}%
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold text-foreground">
                {c.pct === 100 ? 'الملف الشخصي مكتمل ✓' : 'اكتمال الملف الشخصي'}
              </p>
              <p className="text-xs text-muted-foreground">
                {c.pct === 100
                  ? 'البيانات والمرفقات المطلوبة كلها موجودة.'
                  : `ينقص ${fmtNumber(c.missingFields.length + c.missingDocs.length)} — ما يحتاجه المكتب عند العقد والرواتب والتأمينات والطوارئ.`}
              </p>
            </div>
            {isDirector && c.missingFields.length > 0 && (
              <Button variant="outline" size="sm" onClick={onEdit}>
                أكمل البيانات
              </Button>
            )}
          </div>

          {c.pct < 100 && (
            <div className="grid gap-3 sm:grid-cols-2">
              <CheckGroup
                title="البيانات"
                items={PROFILE_FIELDS.map((f) => ({ label: f.label, ok: !!member[f.key] }))}
              />
              <CheckGroup
                title="المرفقات المطلوبة"
                items={REQUIRED.map((r) => ({ label: r.label, ok: c.docState[r.key] }))}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* المرفقات المطلوبة */}
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2.5 text-base font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gold/10">
              <Paperclip className="h-[18px] w-[18px] text-gold" />
            </span>
            المرفقات
          </CardTitle>
          {canEdit && (
            <DropdownMenu dir="rtl">
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={!!busy}>
                  <Plus className="h-4 w-4" />
                  مرفق آخر
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {(['cv', 'contract', 'other'] as MemberDocType[]).map((t) => (
                  <DropdownMenuItem key={t} onSelect={() => void pickAndUpload(t)}>
                    {MEMBER_DOC_LABELS[t]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {REQUIRED.map((r) => {
              const doc = r.key === 'photo' ? null : latest(r.key)
              const legacyUrl =
                !doc && r.key === 'degree'
                  ? member.qualification_doc_url
                  : !doc && r.key === 'license'
                    ? member.lawyer_license_url
                    : null
              const present = r.key === 'photo' ? !!member.avatar_url : !!doc || !!legacyUrl
              return (
                <div
                  key={r.key}
                  className={cn(
                    'flex flex-col rounded-2xl border p-4 transition-colors',
                    present ? 'border-emerald-500/30 bg-emerald-500/[0.04]' : 'border-dashed'
                  )}
                >
                  <div className="flex items-start gap-3">
                    {r.key === 'photo' && member.avatar_url ? (
                      <img src={member.avatar_url} alt="" className="h-11 w-11 rounded-xl object-cover" />
                    ) : (
                      <span
                        className={cn(
                          'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
                          present ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground'
                        )}
                      >
                        <r.icon className="h-5 w-5" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                        {r.label}
                        {present && <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
                      </p>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                        {doc
                          ? `رُفعت ${fmtDatePref(doc.created_at.slice(0, 10))}`
                          : legacyUrl
                            ? 'من طلب التوظيف'
                            : present
                              ? 'موجودة'
                              : r.hint}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {doc && (
                      <Button variant="ghost" size="sm" className="h-8 gap-1 px-2 text-xs" onClick={() => void open(doc)}>
                        <Eye className="h-3.5 w-3.5" />
                        معاينة
                      </Button>
                    )}
                    {legacyUrl && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1 px-2 text-xs"
                        onClick={() => onPreview(legacyUrl, r.label)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        معاينة
                      </Button>
                    )}
                    {r.key === 'photo' && member.avatar_url && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1 px-2 text-xs"
                        onClick={() => onPreview(member.avatar_url!, r.label)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        معاينة
                      </Button>
                    )}
                    {canEdit && (
                      <Button
                        variant={present ? 'ghost' : 'gold'}
                        size="sm"
                        className="h-8 gap-1 px-2.5 text-xs"
                        disabled={!!busy}
                        onClick={() => void pickAndUpload(r.key === 'photo' ? 'photo' : r.key)}
                      >
                        {busy === r.key ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : present ? (
                          <RefreshCw className="h-3.5 w-3.5" />
                        ) : (
                          <Plus className="h-3.5 w-3.5" />
                        )}
                        {present ? 'استبدال' : 'رفع'}
                      </Button>
                    )}
                    {canEdit && doc && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs text-muted-foreground hover:text-destructive"
                        title="حذف"
                        onClick={() => remove(doc)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* مرفقات أخرى + ما رُفع مع طلب التوظيف */}
          {(others.length > 0 || member.cv_url) && (
            <div className="-mx-3 divide-y divide-border/60 border-t pt-2">
              {others.map((d) => (
                <div key={d.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold/10 text-gold-600 dark:text-gold-300">
                    <FileText className="h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{MEMBER_DOC_LABELS[d.doc_type]}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      <bdi>{d.file_name}</bdi> · {fmtDatePref(d.created_at.slice(0, 10))}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8" title="معاينة" onClick={() => void open(d)}>
                    <Eye className="h-4 w-4" />
                  </Button>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      title="حذف"
                      onClick={() => remove(d)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              {[
                { label: 'السيرة الذاتية', url: member.cv_url },
              ]
                .filter((x) => x.url)
                .map((x) => (
                  <div key={x.label} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <FileText className="h-[18px] w-[18px]" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{x.label}</p>
                      <p className="text-xs text-muted-foreground">من طلب التوظيف</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="معاينة" onClick={() => onPreview(x.url!, x.label)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
            </div>
          )}

          {isLoading && <p className="text-xs text-muted-foreground">جارٍ تحميل المرفقات…</p>}
        </CardContent>
      </Card>
      {dialog}
    </div>
  )
}

function CheckGroup({ title, items }: { title: string; items: { label: string; ok: boolean }[] }) {
  const done = items.filter((i) => i.ok).length
  return (
    <div className="rounded-xl bg-muted/40 p-3">
      <p className="mb-2 flex items-center justify-between text-xs font-semibold text-foreground">
        {title}
        <span className="font-normal text-muted-foreground">
          {fmtNumber(done)} من {fmtNumber(items.length)}
        </span>
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {items.map((i) => (
          <li
            key={i.label}
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs',
              i.ok ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-card text-muted-foreground ring-1 ring-border'
            )}
          >
            {i.ok ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
            {i.label}
          </li>
        ))}
      </ul>
    </div>
  )
}
