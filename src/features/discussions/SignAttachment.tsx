// توقيع ملف أُرسل في النقاش (طلب المدير 2026-09-29: «ودي في النقاش إذا احد أرسل ملف أقدر أوقعه»).
// PDF فقط وللمدير وحده (التوقيع والختم المحفوظان في الإعدادات توقيعه هو). يُختار الموضع بالسحب على
// الصفحة الحقيقية (نافذة الصادر نفسها)، ويُدمج في المتصفح (stampPdf)، والنسخة الموقّعة تُرسل ردّاً في
// خيط الرسالة وتظهر في النقاش — والأصل يبقى كما هو.
import { useMemo, useState } from 'react'
import { Loader2, PenLine } from 'lucide-react'

import { StampPlacementDialog } from '@/features/outgoing/StampPlacementDialog'
import { useOfficeInfo, useLookups } from '@/hooks/useSettings'
import { SIGNATURE_CONFIG_KEY } from '@/features/settings/OfficeInfoTab'
import { useIsDirector } from '@/hooks/useIsDirector'
import { usePostAttachment } from '@/hooks/useDiscussions'
import { stampPdf, type ApplyMode, type StampPosition } from '@/lib/pdfStamp'
import { errMessage } from '@/lib/errors'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

export const isPdfName = (name: string | null | undefined) => /\.pdf$/i.test(name ?? '')

export function SignAttachmentButton({
  name,
  url,
  caseId,
  parentId,
  compact = false,
}: {
  name: string
  url: string | null
  caseId: string | null
  /** الرسالة التي يُردّ تحتها بالنسخة الموقّعة */
  parentId: string
  compact?: boolean
}) {
  const isDirector = useIsDirector()
  const { data: office } = useOfficeInfo()
  const postM = usePostAttachment()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const stampUrl = office?.stamp_url ?? null
  const { data: lookups } = useLookups()
  // توقيع المدير محفوظ في الإعدادات (integration_config) كما في دورة اعتماد الصادر
  const signatureUrl = useMemo(
    () =>
      (lookups ?? []).find((x) => x.type === 'integration_config' && x.label === SIGNATURE_CONFIG_KEY)
        ?.value ?? null,
    [lookups]
  )
  if (!isDirector || !url || !isPdfName(name)) return null

  const start = () => {
    if (!signatureUrl && !stampUrl) {
      toast({
        variant: 'destructive',
        title: 'لا توقيع محفوظ بعد',
        description: 'ارفع توقيعك (والختم إن شئت) من الإعدادات ← بيانات المكتب، ثم وقّع.',
      })
      return
    }
    setOpen(true)
  }

  const confirm = async (pos: StampPosition, mode: ApplyMode, sigs: StampPosition[]) => {
    setBusy(true)
    try {
      const blob = await stampPdf(url, {
        stampUrl: mode === 'signature' ? null : stampUrl,
        signatureUrl: mode === 'stamp' ? null : signatureUrl,
        position: pos,
        extraSignatures: mode === 'stamp' ? [] : sigs,
      })
      const base = name.replace(/\.pdf$/i, '')
      const signedName = `${base} - ${mode === 'stamp' ? 'مختوم' : 'موقّع'}.pdf`
      await postM.mutateAsync({
        caseId,
        parentId,
        file: new File([blob], signedName, { type: 'application/pdf' }),
        caption: `✍️ نسخة ${mode === 'stamp' ? 'مختومة' : mode === 'both' ? 'موقّعة ومختومة' : 'موقّعة'} من «${name}»`,
        description: `نسخة موقّعة من «${name}»`,
      })
      setOpen(false)
    } catch (e) {
      toast({ variant: 'destructive', title: 'تعذّر التوقيع', description: errMessage(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={start}
        disabled={busy}
        title="وقّع هذا الملف — تُرسل نسخة موقّعة في الخيط ويبقى الأصل"
        className={cn(
          'inline-flex shrink-0 items-center gap-1 rounded-lg border border-gold/50 font-medium text-gold transition-colors hover:bg-gold/10 disabled:opacity-60',
          compact ? 'mt-1 px-1.5 py-0.5 text-[11px]' : 'mt-1.5 px-2.5 py-1.5 text-xs'
        )}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PenLine className="h-3.5 w-3.5" />}
        وقّع
      </button>
      {open && (
        <StampPlacementDialog
          open={open}
          onClose={() => !busy && setOpen(false)}
          fileUrl={url}
          stampUrl={stampUrl}
          signatureUrl={signatureUrl}
          initialMode={signatureUrl ? 'signature' : 'stamp'}
          onConfirm={confirm}
          confirmLabel="وقّع وأرسل في الخيط"
          confirming={busy}
        />
      )}
    </>
  )
}
