// دورة اعتماد الخطاب الصادر: الموظف يطلب ← المدير يعاين النسخة المختومة ويوافق.
// الدمج يتم في المتصفح (pdf-lib) ثم تُرفع النسخة الموقّعة وتصبح ملف الخطاب الرئيسي.
import { useEffect, useRef, useState } from 'react'
import {
  Stamp,
  Clock,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Loader2,
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
import { stampPdf } from '@/lib/pdfStamp'
import { uploadFile } from '@/lib/files'
import { fmtDatePref } from '@/lib/format'
import { SIGNATURE_CONFIG_KEY } from '@/features/settings/OfficeInfoTab'
import type { OutgoingLetter } from '@/types/db'

const isPdf = (url: string | null | undefined) =>
  !!url && url.toLowerCase().includes('.pdf')

export function ApprovalSection({ letter: l }: { letter: OutgoingLetter }) {
  const { teamMember } = useAuth()
  const isDirector = useIsDirector()
  const requestM = useRequestApproval()
  const [approveOpen, setApproveOpen] = useState(false)

  const a = l.approval
  const canRequest = isPdf(l.file_url)

  const request = () =>
    requestM.mutate({
      letter: l,
      requesterId: teamMember?.id ?? null,
      requesterName: teamMember?.name ?? null,
    })

  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <Stamp className="h-5 w-5 text-gold" />
          <h3 className="font-semibold text-foreground">التوقيع والاعتماد</h3>
        </div>

        {/* الحالة الحالية */}
        {a?.status === 'approved' ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
            <p className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              معتمد وموقّع
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {a.approver?.name ? `بواسطة ${a.approver.name}` : ''}
              {a.approved_at ? ` — ${fmtDatePref(a.approved_at)}` : ''}
            </p>
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
            {a.requester?.name && (
              <p className="mt-1 text-sm text-muted-foreground">
                طلبه: {a.requester.name}
                {a.requested_at ? ` — ${fmtDatePref(a.requested_at)}` : ''}
              </p>
            )}
            {isDirector && (
              <Button
                variant="gold"
                size="sm"
                className="mt-3"
                onClick={() => setApproveOpen(true)}
              >
                <Stamp className="h-4 w-4" />
                معاينة واعتماد
              </Button>
            )}
          </div>
        ) : a?.status === 'rejected' ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4">
            <p className="flex items-center gap-2 font-medium text-destructive">
              <XCircle className="h-5 w-5 shrink-0" />
              مرفوض
            </p>
            {a.note && (
              <p className="mt-1 text-sm text-muted-foreground">
                السبب: {a.note}
              </p>
            )}
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={request}
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
              <Button variant="gold" size="sm" onClick={() => setApproveOpen(true)}>
                <Stamp className="h-4 w-4" />
                توقيع واعتماد
              </Button>
            ) : (
              <Button
                variant="gold"
                size="sm"
                onClick={request}
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
              يُدمَج ختم الشركة{' '}
              {`‏`}(والتوقيع إن وُجد) في الملف تلقائياً.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            ارفع ملف الخطاب بصيغة PDF أولاً لتفعيل طلب الاعتماد.
          </p>
        )}

        {/* حوار المعاينة والاعتماد (المدير) */}
        <ApprovalDialog
          letter={l}
          open={approveOpen}
          onClose={() => setApproveOpen(false)}
        />
      </CardContent>
    </Card>
  )
}

function ApprovalDialog({
  letter: l,
  open,
  onClose,
}: {
  letter: OutgoingLetter
  open: boolean
  onClose: () => void
}) {
  const { teamMember } = useAuth()
  const { data: office } = useOfficeInfo()
  const { data: lookups } = useLookups()
  const approveM = useApproveLetter()
  const rejectM = useRejectLetter()

  const signatureUrl =
    (lookups ?? []).find(
      (x) => x.type === 'integration_config' && x.label === SIGNATURE_CONFIG_KEY
    )?.value ?? null

  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [genError, setGenError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState('')
  const blobRef = useRef<Blob | null>(null)

  // توليد المعاينة المختومة عند الفتح
  useEffect(() => {
    if (!open || !l.file_url) return
    let objectUrl: string | null = null
    setBlobUrl(null)
    setGenError(null)
    setRejecting(false)
    setNote('')
    ;(async () => {
      try {
        const blob = await stampPdf(l.file_url!, {
          stampUrl: office?.stamp_url ?? null,
          signatureUrl,
        })
        blobRef.current = blob
        objectUrl = URL.createObjectURL(blob)
        setBlobUrl(objectUrl)
      } catch (e) {
        setGenError(
          e instanceof Error ? e.message : 'تعذّر تجهيز المعاينة'
        )
      }
    })()
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, l.file_url, office?.stamp_url, signatureUrl])

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
        description: e instanceof Error ? e.message : undefined,
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
          <DialogTitle>معاينة الخطاب بعد الختم والتوقيع</DialogTitle>
        </DialogHeader>

        {genError ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {genError}
          </div>
        ) : blobUrl ? (
          <iframe
            title="معاينة الخطاب"
            src={blobUrl}
            className="h-[65vh] w-full rounded-xl border"
          />
        ) : (
          <div className="flex h-[65vh] items-center justify-center gap-2 text-sm text-muted-foreground">
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
