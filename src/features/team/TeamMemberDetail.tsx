// صفحة الموظف: بياناته + سجله المالي (رواتب/مكافآت/بدلات/خصومات)
// الوصول: المدير لأي موظف، والموظف لصفحته فقط (والقراءة محمية أيضاً بـ RLS)
import { useMemo, useRef, useState } from 'react'
import { useLocation } from 'wouter'
import {
  ArrowRight,
  Wallet,
  Plus,
  Pencil,
  Trash2,
  Paperclip,
  KeyRound,
  Loader2,
  MessageSquarePlus,
  ShieldAlert,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import { DualDatePicker } from '@/components/DualDatePicker'
import { FilePreviewDialog } from '@/components/FilePreviewDialog'

import { cn } from '@/lib/utils'
import { fmtNumber, fmtDatePref, todayISO } from '@/lib/format'
import { pickFile, uploadFile } from '@/lib/files'
import { errMessage } from '@/lib/errors'
import { toast } from '@/hooks/use-toast'
import { useAuth } from '@/stores/auth'
import { useIsDirector } from '@/hooks/useIsDirector'
import { useOpenDm } from '@/hooks/useDiscussions'
import { requestDiscussionJump } from '@/lib/discussionJump'
import { useTeamMembers, useProvisionMember } from '@/hooks/useTeam'
import {
  usePayrollEntries,
  useAddPayrollEntry,
  useDeletePayrollEntry,
} from '@/hooks/usePayroll'
import {
  PAY_TYPE_OPTIONS,
  payTypeLabel,
  payTypeBadge,
  signedAmount,
} from './payrollLabels'
import { TeamMemberForm } from './TeamMemberForm'
import { MyDetailsDialog } from './MyDetailsDialog'
import { LeaveBalanceCard } from '@/features/hr/LeaveBalanceCard'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { usePageState } from '@/hooks/usePageState'
import { useMemberWork } from '@/hooks/useMemberWork'
import { useMemberDocuments } from '@/hooks/useMemberDocuments'
import { memberCompleteness } from './MemberDocuments'
import { MemberHero, MemberHrList, MemberInfoTab, MemberStats, MemberWorkTab } from './MemberProfileParts'
import type { PayrollEntry } from '@/types/db'

// اسم الشهر بالعربية + السنة بأرقام لاتينية (وفق نمط النظام)
function monthTitle(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  const name = new Date(y, m - 1, 1).toLocaleDateString('ar', { month: 'long' })
  return `${name} ${y}`
}

export function TeamMemberDetail({ id }: { id: string }) {
  const [, navigate] = useLocation()
  const { teamMember: me } = useAuth()
  const isDirector = useIsDirector()
  const { data: members, isLoading } = useTeamMembers()

  const isSelf = me?.id === id
  const allowed = isDirector || isSelf
  const member = (members ?? []).find((m) => m.id === id)

  const { data: entries, isLoading: loadingPay } = usePayrollEntries(
    allowed ? id : null
  )
  const provisionM = useProvisionMember()
  const openDm = useOpenDm()
  const addM = useAddPayrollEntry()
  const deleteM = useDeletePayrollEntry()

  const [addOpen, setAddOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteFor, setDeleteFor] = useState<PayrollEntry | null>(null)
  const [preview, setPreview] = useState<PayrollEntry | null>(null)
  const [docPreview, setDocPreview] = useState<{ url: string; name: string } | null>(null)
  const [tab, setTab] = usePageState<string>(`member-tab:${id}`, 'work')
  const { data: work, isLoading: loadingWork } = useMemberWork(allowed ? member : null)
  const { data: docs, isSuccess: docsReady } = useMemberDocuments(allowed ? member?.id : null)

  // آخر قيد مُختار للحذف — يبقى للعرض أثناء أنيميشن إغلاق حوار التأكيد
  const lastDeleteRef = useRef<PayrollEntry | null>(null)
  if (deleteFor) lastDeleteRef.current = deleteFor
  const deleteShown = deleteFor ?? lastDeleteRef.current

  // تجميع القيود بالشهر (الأحدث أولاً) + صافي كل شهر
  const months = useMemo(() => {
    const map = new Map<string, PayrollEntry[]>()
    for (const e of entries ?? []) {
      const ym = e.entry_date.slice(0, 7)
      const arr = map.get(ym)
      if (arr) arr.push(e)
      else map.set(ym, [e])
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [entries])

  const yearNet = useMemo(() => {
    const y = todayISO().slice(0, 4)
    return (entries ?? [])
      .filter((e) => e.entry_date.startsWith(y))
      .reduce((s, e) => s + signedAmount(e), 0)
  }, [entries])

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Button variant="ghost" onClick={() => navigate('/team')}>
          <ArrowRight className="h-4 w-4" />
          رجوع
        </Button>
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>غير مصرّح</AlertTitle>
          <AlertDescription>
            هذه الصفحة خاصة — يطّلع عليها المدير أو صاحبها فقط.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!member) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Button variant="ghost" onClick={() => navigate('/team')}>
          <ArrowRight className="h-4 w-4" />
          رجوع
        </Button>
        <Alert variant="destructive">
          <AlertTitle>الموظف غير موجود</AlertTitle>
        </Alert>
      </div>
    )
  }

  const firstName = member.short_name || member.name.split(' ')[0]

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Button variant="ghost" onClick={() => navigate('/team')}>
        <ArrowRight className="h-4 w-4" />
        رجوع للموظفين
      </Button>

      <MemberHero
        member={member}
        lastSeen={work?.lastSeen}
        completeness={docsReady ? memberCompleteness(member, docs).pct : undefined}
        onCompleteness={() => setTab('info')}
        actions={
          <>
            {/* محادثة مباشرة معه — بينكما وحدكما (طلب المدير 2026-09-22) */}
            {!isSelf && member.is_active && !member.is_reviewer && (
              <Button
                variant="outline"
                size="sm"
                disabled={openDm.isPending}
                onClick={() =>
                  openDm.mutate(member.id, {
                    onSuccess: (id) => {
                      requestDiscussionJump({ caseId: id })
                      navigate('/discussions')
                    },
                  })
                }
              >
                {openDm.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MessageSquarePlus className="h-4 w-4" />
                )}
                محادثة
              </Button>
            )}
            {/* موظف بلا حساب دخول لا يستطيع طلب رمز أصلاً — والفشل صامت،
                فنُظهر الحالة هنا ونتيح فتحه بضغطة */}
            {isDirector && !member.auth_id && (
              <Button
                variant="gold"
                size="sm"
                onClick={() =>
                  provisionM.mutate({ memberId: member.id, welcome: true })
                }
                disabled={provisionM.isPending || !member.email}
                title={
                  member.email
                    ? undefined
                    : 'يحتاج بريداً إلكترونياً — عدّل بياناته أولاً'
                }
              >
                {provisionM.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="h-4 w-4" />
                )}
                فتح حساب الدخول
              </Button>
            )}
            {isDirector && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="h-4 w-4" />
                تعديل
              </Button>
            )}
            {isSelf && !isDirector && <MyDetailsDialog member={member} />}
          </>
        }
      />

      <MemberStats memberId={member.id} work={work} loading={loadingWork} onTab={setTab} />

      <Tabs value={tab} onValueChange={setTab} dir="rtl">
        <TabsList className="h-11 rounded-xl p-1">
          <TabsTrigger value="work" className="rounded-lg px-4">عمله الآن</TabsTrigger>
          <TabsTrigger value="info" className="rounded-lg px-4">بياناته</TabsTrigger>
          <TabsTrigger value="hr" className="rounded-lg px-4">الإجازات</TabsTrigger>
          <TabsTrigger value="pay" className="rounded-lg px-4">المالية</TabsTrigger>
        </TabsList>

        <TabsContent value="work">
          <MemberWorkTab work={work} loading={loadingWork} firstName={firstName} />
        </TabsContent>

        <TabsContent value="info">
          <MemberInfoTab
            member={member}
            isDirector={isDirector}
            canEdit={isDirector || isSelf}
            onEdit={() => setEditOpen(true)}
            onPreview={(url, name) => setDocPreview({ url, name })}
          />
        </TabsContent>

        <TabsContent value="hr" className="space-y-4">
          <LeaveBalanceCard memberId={member.id} isSelf={isSelf} />
          <MemberHrList memberId={member.id} />
        </TabsContent>

        <TabsContent value="pay">
          {/* السجل المالي */}
          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
              <CardTitle className="flex flex-wrap items-center gap-2.5 text-base font-semibold">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gold/10">
                  <Wallet className="h-[18px] w-[18px] text-gold" />
                </span>
                السجل المالي
                {(entries?.length ?? 0) > 0 && (
                  <span className="text-sm font-normal text-muted-foreground">
                    (صافي {todayISO().slice(0, 4)}: {fmtNumber(yearNet)} ريال)
                  </span>
                )}
              </CardTitle>
              {isDirector && (
                <Button variant="gold" size="sm" onClick={() => setAddOpen(true)}>
                  <Plus className="h-4 w-4" />
                  إضافة قيد
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-5">
              {loadingPay ? (
                <div className="space-y-2">
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                </div>
              ) : months.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-10 text-center">
                  <Wallet className="mb-2 h-6 w-6 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {isDirector
                      ? 'لا قيود بعد — أضف أول راتب أو مكافأة عبر «إضافة قيد».'
                      : 'لا قيود مسجّلة لك بعد.'}
                  </p>
                </div>
              ) : (
                months.map(([ym, list]) => {
                  const net = list.reduce((s, e) => s + signedAmount(e), 0)
                  return (
                    <div key={ym}>
                      <div className="mb-2 flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-foreground">
                          {monthTitle(ym)}
                        </h3>
                        <span
                          className={cn(
                            'text-sm font-semibold',
                            net >= 0 ? 'text-emerald-600' : 'text-destructive'
                          )}
                        >
                          {net >= 0 ? '' : '−'}
                          {fmtNumber(Math.abs(net))} ريال
                        </span>
                      </div>
                      <div className="divide-y divide-border/60 overflow-hidden rounded-xl border">
                        {list.map((e) => (
                          <div key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                            <Badge variant={payTypeBadge(e.entry_type)} className="shrink-0">
                              {payTypeLabel(e.entry_type)}
                            </Badge>
                            <div className="min-w-0 flex-1">
                              <p
                                className={cn(
                                  'text-sm font-semibold',
                                  e.entry_type === 'deduction'
                                    ? 'text-destructive'
                                    : 'text-foreground'
                                )}
                              >
                                {e.entry_type === 'deduction' ? '−' : ''}
                                {fmtNumber(Math.abs(e.amount))} ريال
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {fmtDatePref(e.entry_date)}
                                {e.note ? ` — ${e.note}` : ''}
                              </p>
                            </div>
                            {e.file_url && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground"
                                title="معاينة المرفق"
                                onClick={() => setPreview(e)}
                              >
                                <Paperclip className="h-4 w-4" />
                              </Button>
                            )}
                            {isDirector && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                title="حذف القيد"
                                onClick={() => setDeleteFor(e)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>

        </TabsContent>
      </Tabs>

      {/* تعديل بيانات الموظف (المدير فقط) */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent
          className="max-w-2xl"
          onInteractOutside={(e) => e.preventDefault()}
        >
          <TeamMemberForm member={member} onDone={() => setEditOpen(false)} />
        </DialogContent>
      </Dialog>

      {/* إضافة قيد (المدير فقط) */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <AddEntryForm
            teamMemberId={id}
            createdBy={me?.id ?? null}
            pending={addM.isPending}
            onSubmit={(input) =>
              addM.mutate(input, { onSuccess: () => setAddOpen(false) })
            }
            onCancel={() => setAddOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <FilePreviewDialog
        open={!!docPreview}
        onOpenChange={(o) => !o && setDocPreview(null)}
        fileUrl={docPreview?.url ?? null}
        fileName={docPreview?.name ?? null}
      />

      <FilePreviewDialog
        open={!!preview}
        onOpenChange={(o) => !o && setPreview(null)}
        fileUrl={preview?.file_url ?? null}
        fileName={preview ? payTypeLabel(preview.entry_type) : null}
      />

      {/* حذف قيد */}
      <AlertDialog open={!!deleteFor} onOpenChange={(o) => !o && setDeleteFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف القيد</AlertDialogTitle>
            <AlertDialogDescription>
              سيُحذف قيد «{payTypeLabel(deleteShown?.entry_type)} —{' '}
              {fmtNumber(Math.abs(deleteShown?.amount ?? 0))} ريال». متابعة؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteFor)
                  deleteM.mutate({
                    id: deleteFor.id,
                    teamMemberId: id,
                    deletedBy: me?.name ?? null,
                  })
                setDeleteFor(null)
              }}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function AddEntryForm({
  teamMemberId,
  createdBy,
  pending,
  onSubmit,
  onCancel,
}: {
  teamMemberId: string
  createdBy: string | null
  pending: boolean
  onSubmit: (input: {
    team_member_id: string
    entry_type: string
    amount: number
    entry_date: string
    note: string | null
    file_url?: string | null
    created_by: string | null
  }) => void
  onCancel: () => void
}) {
  const [entryType, setEntryType] = useState('salary')
  const [amount, setAmount] = useState('')
  const [entryDate, setEntryDate] = useState<string | null>(todayISO())
  const [note, setNote] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    const num = Number(amount.replace(/[^\d.]/g, ''))
    if (!num || num <= 0) {
      setError('أدخل مبلغاً صحيحاً أكبر من صفر.')
      return
    }
    if (!entryDate) {
      setError('حدّد تاريخ القيد.')
      return
    }
    setError(null)

    let fileUrl: string | null = null
    if (file) {
      setUploading(true)
      try {
        const { publicUrl } = await uploadFile(file, { folder: 'payroll' })
        fileUrl = publicUrl
      } catch (e) {
        // فشل الرفع يوقف الحفظ برسالة واضحة — لا حفظ قيد بلا مرفقه
        setError(errMessage(e) ?? 'تعذّر رفع المرفق')
        toast({
          variant: 'destructive',
          title: 'تعذّر رفع المرفق',
          description: errMessage(e),
        })
        return
      } finally {
        setUploading(false)
      }
    }

    onSubmit({
      team_member_id: teamMemberId,
      entry_type: entryType,
      amount: num,
      entry_date: entryDate,
      note: note.trim() || null,
      file_url: fileUrl,
      created_by: createdBy,
    })
  }

  const busy = pending || uploading

  return (
    <>
      <DialogHeader>
        <DialogTitle>إضافة قيد مالي</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>النوع</Label>
            <Select value={entryType} onValueChange={setEntryType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAY_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay_amount">المبلغ (ريال)</Label>
            <Input
              id="pay_amount"
              dir="ltr"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
        </div>

        <DualDatePicker
          label="تاريخ القيد"
          value={entryDate}
          onChange={setEntryDate}
        />

        <div className="space-y-1.5">
          <Label htmlFor="pay_note">ملاحظة</Label>
          <Textarea
            id="pay_note"
            rows={2}
            placeholder="مثال: راتب شهر يوليو / مكافأة إنجاز قضية…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={async () => {
              const f = await pickFile()
              if (f) setFile(f)
            }}
          >
            <Paperclip className="h-4 w-4" />
            إرفاق إشعار (اختياري)
          </Button>
          {file && (
            <>
              <span className="truncate text-xs text-muted-foreground">
                {file.name}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setFile(null)}
              >
                إزالة
              </Button>
            </>
          )}
        </div>

        {error && <p className="text-xs font-medium text-destructive">{error}</p>}
      </div>
      <DialogFooter className="gap-2">
        <Button variant="gold" disabled={busy} onClick={submit}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          إضافة
        </Button>
        <Button variant="outline" onClick={onCancel}>
          إلغاء
        </Button>
      </DialogFooter>
    </>
  )
}
