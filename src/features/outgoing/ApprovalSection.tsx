// دورة اعتماد الخطاب الصادر: الطالب يحدّد مكان الختم على الصفحة ← المدير
// يعاين النسخة المختومة على الموضع المختار (ويقدر يعدّله) ← موافقة بضغطة.
// الدمج يتم في المتصفح (pdf-lib) ثم تُرفع النسخة الموقّعة وتصبح ملف الخطاب الرئيسي.
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Stamp,
  Clock,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Loader2,
  Move,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import { useAuth } from '@/stores/auth'
import { useIsDirector } from '@/hooks/useIsDirector'
import { useOfficeInfo, useLookups } from '@/hooks/useSettings'
import {
  useRequestApproval,
  useApproveLetter,
  useRejectLetter,
} from '@/hooks/useOutgoingApprovals'
import {
  stampPdf,
  applyModeLabel,
  type ApplyMode,
  type StampPosition,
} from '@/lib/pdfStamp'
import { uploadFile } from '@/lib/files'
import { fmtDateTime } from '@/lib/format'
import { SIGNATURE_CONFIG_KEY } from '@/features/settings/OfficeInfoTab'
import { StampPlacementDialog } from './StampPlacementDialog'
import type { OutgoingLetter } from '@/types/db'
import { errMessage } from '@/lib/errors'

const isPdf = (url: string | null | undefined) =>
  !!url && url.toLowerCase().includes('.pdf')

// سطر في سجلّ الدورة: «قدّم الطلب: يسرى — ٢٣/٠٧/٢٠٢٦ ٢:٣٥ م»
function TrailLine({
  label,
  name,
  at,
}: {
  label: string
  name?: string | null
  at?: string | null
}) {
  if (!name) return null
  return (
    <p className="text-sm text-muted-foreground">
      {label}: <span className="font-medium text-foreground">{name}</span>
      {at ? ` — ${fmtDateTime(at)}` : ''}
    </p>
  )
}

export function ApprovalSection({ letter: l }: { letter: OutgoingLetter }) {
  const { teamMember } = useAuth()
  const isDirector = useIsDirector()
  const { data: office } = useOfficeInfo()
  const { data: lookups } = useLookups()
  const requestM = useRequestApproval()

  const stampUrl = office?.stamp_url ?? null
  const signatureUrl = useMemo(
    () =>
      (lookups ?? []).find(
        (x) =>
          x.type === 'integration_config' && x.label === SIGNATURE_CONFIG_KEY
      )?.value ?? null,
    [lookups]
  )

  const a = l.approval
  const canRequest = isPdf(l.file_url)

  // الموضع المحفوظ مع الطلب (إن وُجد)
  const storedPos: StampPosition | null =
    a?.stamp_x != null && a?.stamp_y != null
      ? { page: a.stamp_page ?? 1, x: a.stamp_x, y: a.stamp_y }
      : null
  const storedSig2: StampPosition | null =
    a?.sig2_x != null && a?.sig2_y != null
      ? { page: a.sig2_page ?? 1, x: a.sig2_x, y: a.sig2_y }
      : null

  const [placementOpen, setPlacementOpen] = useState(false)
  const [placementMode, setPlacementMode] = useState<'request' | 'direct' | 'edit'>(
    'request'
  )
  const [approveOpen, setApproveOpen] = useState(false)
  // موضع/نوع اختارهما المدير في هذه الجلسة (يغلبان المحفوظ)
  const [overridePos, setOverridePos] = useState<StampPosition | null>(null)
  const [overrideMode, setOverrideMode] = useState<ApplyMode | null>(null)
  // undefined = لا تجاوز، null = أزال المدير التوقيع الثاني
  const [overrideSig2, setOverrideSig2] = useState<
    StampPosition | null | undefined
  >(undefined)

  const effectivePos = overridePos ?? storedPos
  const storedMode = (a?.apply_mode as ApplyMode | null) ?? 'both'
  const effectiveMode = overrideMode ?? storedMode
  const effectiveSig2 = overrideSig2 !== undefined ? overrideSig2 : storedSig2

  const openRequestPlacement = () => {
    setPlacementMode('request')
    setPlacementOpen(true)
  }
  const openDirectorFlow = () => {
    if (effectivePos) setApproveOpen(true)
    else {
      setPlacementMode('direct')
      setPlacementOpen(true)
    }
  }

  const onPlacementConfirm = (
    pos: StampPosition,
    mode: ApplyMode,
    sig2: StampPosition | null
  ) => {
    if (placementMode === 'request') {
      requestM.mutate(
        {
          letter: l,
          position: pos,
          mode,
          signature2: sig2,
          requesterId: teamMember?.id ?? null,
          requesterName: teamMember?.name ?? null,
        },
        { onSuccess: () => setPlacementOpen(false) }
      )
    } else {
      setOverridePos(pos)
      setOverrideMode(mode)
      setOverrideSig2(sig2)
      setPlacementOpen(false)
      setApproveOpen(true)
    }
  }

  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-4 flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gold/10">
            <Stamp className="h-[18px] w-[18px] text-gold" />
          </span>
          <h3 className="text-[15px] font-semibold text-foreground">
            التوقيع والاعتماد
          </h3>
        </div>

        {/* الحالة الحالية */}
        {a?.status === 'approved' ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
            <p className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              معتمد وموقّع
            </p>
            <div className="mt-1.5 space-y-0.5">
              <TrailLine
                label="قدّم الطلب"
                name={a.requester?.name}
                at={a.requested_at}
              />
              <TrailLine
                label="اعتمده"
                name={a.approver?.name}
                at={a.approved_at}
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              ملف الخطاب أعلاه هو النسخة الموقّعة.
            </p>
            {a.original_file_url && (
              <Button variant="ghost" size="sm" className="mt-2" asChild>
                <a
                  href={a.original_file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-4 w-4" />
                  النسخة الأصلية (قبل التوقيع)
                </a>
              </Button>
            )}
          </div>
        ) : a?.status === 'pending' ? (
          <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-4">
            <p className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-300">
              <Clock className="h-5 w-5 shrink-0" />
              بانتظار اعتماد المدير
            </p>
            <div className="mt-1.5 space-y-0.5">
              <TrailLine
                label="قدّم الطلب"
                name={a.requester?.name}
                at={a.requested_at}
              />
              <p className="text-xs text-muted-foreground">
                المطلوب: {applyModeLabel(storedMode)}
                {storedSig2 ? ' (توقيعان)' : ''}
                {storedPos ? ' — الموضع محدَّد ✓' : ''}
              </p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {isDirector && (
                <Button variant="gold" size="sm" onClick={openDirectorFlow}>
                  <Stamp className="h-4 w-4" />
                  معاينة واعتماد
                </Button>
              )}
              {/* الطالب يقدر يعدّل الموضع قبل الاعتماد */}
              {!isDirector && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={openRequestPlacement}
                  disabled={requestM.isPending}
                >
                  <Move className="h-4 w-4" />
                  تعديل الطلب أو الموضع
                </Button>
              )}
            </div>
          </div>
        ) : a?.status === 'rejected' ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4">
            <p className="flex items-center gap-2 font-medium text-destructive">
              <XCircle className="h-5 w-5 shrink-0" />
              مرفوض
            </p>
            <div className="mt-1.5 space-y-0.5">
              <TrailLine
                label="قدّم الطلب"
                name={a.requester?.name}
                at={a.requested_at}
              />
              <TrailLine
                label="رفضه"
                name={a.approver?.name}
                at={a.approved_at}
              />
            </div>
            {a.note && (
              <p className="mt-1 text-sm text-muted-foreground">
                السبب: {a.note}
              </p>
            )}
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={openRequestPlacement}
              disabled={requestM.isPending || !canRequest}
            >
              {requestM.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              إعادة طلب الاعتماد
            </Button>
          </div>
        ) : canRequest ? (
          <div className="flex flex-wrap items-center gap-2">
            {isDirector ? (
              <Button variant="gold" size="sm" onClick={openDirectorFlow}>
                <Stamp className="h-4 w-4" />
                توقيع واعتماد
              </Button>
            ) : (
              <Button
                variant="gold"
                size="sm"
                onClick={openRequestPlacement}
                disabled={requestM.isPending}
              >
                {requestM.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Stamp className="h-4 w-4" />
                )}
                طلب توقيع واعتماد من المدير
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              تختار: ختم وتوقيع، أو ختم فقط، أو توقيع فقط — وتحدد موضعه، ثم
              يعتمده المدير بضغطة.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            ارفع ملف الخطاب بصيغة PDF أولاً لتفعيل طلب الاعتماد.
          </p>
        )}

        {/* اختيار موضع الختم (الطالب/المدير) */}
        {l.file_url && (
          <StampPlacementDialog
            open={placementOpen}
            onClose={() => setPlacementOpen(false)}
            fileUrl={l.file_url}
            stampUrl={stampUrl}
            signatureUrl={signatureUrl}
            initial={effectivePos}
            initialMode={effectiveMode}
            initialSig2={effectiveSig2}
            onConfirm={onPlacementConfirm}
            confirmLabel={
              placementMode === 'request' ? 'تأكيد وإرسال الطلب' : 'تأكيد الموضع'
            }
            confirming={requestM.isPending}
          />
        )}

        {/* حوار المعاينة والاعتماد (المدير) */}
        <ApprovalDialog
          letter={l}
          open={approveOpen}
          onClose={() => setApproveOpen(false)}
          stampUrl={stampUrl}
          signatureUrl={signatureUrl}
          position={effectivePos}
          mode={effectiveMode}
          signature2={effectiveSig2}
          onEditPosition={() => {
            setPlacementMode('edit')
            setPlacementOpen(true)
          }}
        />
      </CardContent>
    </Card>
  )
}

function ApprovalDialog({
  letter: l,
  open,
  onClose,
  stampUrl,
  signatureUrl,
  position,
  mode,
  signature2,
  onEditPosition,
}: {
  letter: OutgoingLetter
  open: boolean
  onClose: () => void
  stampUrl: string | null
  signatureUrl: string | null
  position: StampPosition | null
  mode: ApplyMode
  signature2: StampPosition | null
  onEditPosition: () => void
}) {
  const { teamMember } = useAuth()
  const approveM = useApproveLetter()
  const rejectM = useRejectLetter()

  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [genError, setGenError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState('')
  const blobRef = useRef<Blob | null>(null)

  // توليد المعاينة المختومة عند الفتح أو تغيّر الموضع
  useEffect(() => {
    if (!open || !l.file_url) return
    let objectUrl: string | null = null
    setBlobUrl(null)
    setGenError(null)
    setRejecting(false)
    setNote('')
    ;(async () => {
      try {
        // يُطبَّق ما اختاره الطالب/المدير فقط: ختم، توقيع، أو كلاهما
        const blob = await stampPdf(l.file_url!, {
          stampUrl: mode !== 'signature' ? stampUrl : null,
          signatureUrl: mode !== 'stamp' ? signatureUrl : null,
          position,
          signature2: mode !== 'stamp' ? signature2 : null,
        })
        blobRef.current = blob
        objectUrl = URL.createObjectURL(blob)
        setBlobUrl(objectUrl)
      } catch (e) {
        setGenError(errMessage(e) ?? 'تعذّر تجهيز المعاينة')
      }
    })()
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [open, l.file_url, stampUrl, signatureUrl, position, mode, signature2])

  const approve = async () => {
    if (!blobRef.current || saving) return
    setSaving(true)
    try {
      const base = (l.letter_number || 'letter').replace(/[^\w-]+/g, '_')
      const file = new File([blobRef.current], `${base}_signed.pdf`, {
        type: 'application/pdf',
      })
      const { publicUrl } = await uploadFile(file, { folder: 'outgoing' })
      await approveM.mutateAsync({
        letter: l,
        signedFileUrl: publicUrl,
        approverId: teamMember?.id ?? null,
        approverName: teamMember?.name ?? null,
      })
      onClose()
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'تعذّر حفظ النسخة الموقّعة',
        description: errMessage(e),
      })
    } finally {
      setSaving(false)
    }
  }

  const reject = async () => {
    await rejectM.mutateAsync({
      letter: l,
      note,
      approverId: teamMember?.id ?? null,
      approverName: teamMember?.name ?? null,
    })
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>معاينة الخطاب — {applyModeLabel(mode)}</DialogTitle>
        </DialogHeader>

        {genError ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {genError}
          </div>
        ) : blobUrl ? (
          <iframe
            title="معاينة الخطاب"
            src={blobUrl}
            className="h-[62vh] w-full rounded-xl border"
          />
        ) : (
          <div className="flex h-[62vh] items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            جارٍ تجهيز المعاينة…
          </div>
        )}

        {rejecting && (
          <Textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="سبب الرفض (اختياري) — يصل للموظف في الرسالة"
          />
        )}

        <DialogFooter className="gap-2">
          {rejecting ? (
            <>
              <Button
                variant="destructive"
                onClick={reject}
                disabled={rejectM.isPending}
              >
                {rejectM.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                تأكيد الرفض
              </Button>
              <Button variant="outline" onClick={() => setRejecting(false)}>
                رجوع
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="gold"
                onClick={approve}
                disabled={!blobUrl || saving}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                موافق — اعتماد وتوقيع
              </Button>
              <Button variant="outline" onClick={onEditPosition}>
                <Move className="h-4 w-4" />
                تعديل الموضع
              </Button>
              <Button
                variant="ghost"
                className="text-destructive"
                onClick={() => setRejecting(true)}
              >
                رفض
              </Button>
              <Button variant="outline" onClick={onClose}>
                إلغاء
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
