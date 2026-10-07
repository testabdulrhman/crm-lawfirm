// توقيع ملف أُرسل في النقاش (طلب المدير 2026-09-29: «ودي في النقاش إذا احد أرسل ملف أقدر أوقعه»).
// PDF فقط. يُختار الموضع بالسحب على الصفحة الحقيقية (نافذة الصادر نفسها)، ويُدمج في المتصفح (stampPdf)،
// والنسخة الموقّعة تُرسل ردّاً في خيط الرسالة وتظهر في النقاش وفي مستندات المشروع — والأصل يبقى كما هو.
//
// ومنذ 2026-10-07 («نعم، نفذها والرقم يطبع على الخطاب تحت التوقيع مباشرة»):
//  - الموظف يطلب توقيع المدير من الرسالة نفسها (sign_requests) فيصل المديرَ إشعارٌ يفتح النقاش عندها.
//  - المدير يوقّع ⇒ يُسجَّل الخطاب في الصادر برقمٍ من الخادم، ويُطبع الرقم وتاريخه تحت التوقيع، ويُربط
//    الخطاب بالملف وبرسالة النقاش وبمستند النسخة الموقّعة (وهي النهائية)، ويُبلَّغ الطالب برقمه.
//  - التوقيع والختم يتحرّكان كلٌّ وحده.
import { useMemo, useState } from 'react'
import { Clock, Hash, Loader2, PenLine, X } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { StampPlacementDialog } from '@/features/outgoing/StampPlacementDialog'
import { useOfficeInfo, useLookups } from '@/hooks/useSettings'
import { SIGNATURE_CONFIG_KEY } from '@/features/settings/OfficeInfoTab'
import { useIsDirector } from '@/hooks/useIsDirector'
import { usePostAttachment } from '@/hooks/useDiscussions'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import { numberLines, stampPdf, type ApplyMode, type StampPosition } from '@/lib/pdfStamp'
import { fmtHijri, todayISO } from '@/lib/format'
import { errMessage } from '@/lib/errors'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

export const isPdfName = (name: string | null | undefined) => /\.pdf$/i.test(name ?? '')

interface SignRequest {
  id: string
  comment_id: string
  requested_by: string | null
  note: string | null
  requester: { name: string | null; short_name: string | null } | null
}

/** طلبات التوقيع المعلّقة في نقاشٍ واحد — استعلام واحد يتشاركه كل زرّ في المجرى */
function usePendingSignRequests(caseId: string | null) {
  return useQuery({
    queryKey: ['sign_requests', caseId],
    enabled: !!caseId,
    queryFn: async (): Promise<SignRequest[]> => {
      const { data, error } = await supabase
        .from('sign_requests')
        .select('id, comment_id, requested_by, note, requester:team_members!sign_requests_requested_by_fkey(name, short_name)')
        .eq('case_id', caseId!)
        .eq('status', 'pending')
      if (error) throw error
      return (data ?? []) as unknown as SignRequest[]
    },
  })
}

export function SignAttachmentButton({
  name,
  url,
  caseId,
  parentId,
  messageId,
  documentId,
  compact = false,
}: {
  name: string
  url: string | null
  caseId: string | null
  /** الرسالة التي يُردّ تحتها بالنسخة الموقّعة */
  parentId: string
  /** رسالة الملف نفسها (قد تكون ردّاً في خيط) — بها يُعرف طلب توقيعها */
  messageId: string
  documentId?: string | null
  compact?: boolean
}) {
  const isDirector = useIsDirector()
  const { teamMember } = useAuth()
  const { data: office } = useOfficeInfo()
  const postM = usePostAttachment()
  const qc = useQueryClient()
  const { data: pending } = usePendingSignRequests(caseId)
  const request = pending?.find((r) => r.comment_id === messageId) ?? null
  const [open, setOpen] = useState(false)
  const [askOpen, setAskOpen] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  // خطاب صادر برقم (الافتراضي) — أو توقيع فقط لما ليس خطاباً (عقد يوقّعه الطرفان مثلاً)
  const [asLetter, setAsLetter] = useState(true)

  const stampUrl = office?.stamp_url ?? null
  const { data: lookups } = useLookups()
  // توقيع المدير محفوظ في الإعدادات (integration_config) كما في دورة اعتماد الصادر
  const signatureUrl = useMemo(
    () =>
      (lookups ?? []).find((x) => x.type === 'integration_config' && x.label === SIGNATURE_CONFIG_KEY)
        ?.value ?? null,
    [lookups]
  )

  const askM = useMutation({
    mutationFn: async () => {
      if (!teamMember?.id) throw new Error('لم يُحمَّل ملفك بعد — أعد تحميل الصفحة')
      const { error } = await supabase.from('sign_requests').insert({
        comment_id: messageId,
        case_id: caseId,
        document_id: documentId ?? null,
        requested_by: teamMember.id,
        note: note.trim() || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      setAskOpen(false)
      setNote('')
      qc.invalidateQueries({ queryKey: ['sign_requests', caseId] })
      qc.invalidateQueries({ queryKey: ['pending_outgoing_approvals'] })
      toast({ variant: 'success', title: 'وصل طلب التوقيع للمدير', description: 'يصلك إشعار برقم الصادر حين يوقّع.' })
    },
    onError: (e) => toast({ variant: 'destructive', title: 'لم يُرسل الطلب', description: errMessage(e) }),
  })

  const cancelM = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('sign_requests').update({ status: 'cancelled' }).eq('id', request!.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sign_requests', caseId] })
      qc.invalidateQueries({ queryKey: ['pending_outgoing_approvals'] })
    },
    onError: (e) => toast({ variant: 'destructive', title: 'لم يُلغَ الطلب', description: errMessage(e) }),
  })

  if (!url || !isPdfName(name)) return null

  const chip = compact ? 'mt-1 px-1.5 py-0.5 text-[11px]' : 'mt-1.5 px-2.5 py-1.5 text-xs'
  const requesterName = request?.requester?.short_name || request?.requester?.name || 'موظف'

  // ---------- الموظف: يطلب التوقيع أو يرى طلبه معلّقاً ----------
  if (!isDirector) {
    if (request) {
      const mine = request.requested_by === teamMember?.id
      return (
        <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-lg bg-amber-500/10 font-medium text-amber-700 dark:text-amber-300', chip)}>
          <Clock className="h-3.5 w-3.5" />
          بانتظار توقيع المدير
          {mine && (
            <button
              type="button"
              onClick={() => cancelM.mutate()}
              disabled={cancelM.isPending}
              className="rounded p-0.5 hover:bg-amber-500/20"
              title="إلغاء الطلب"
              aria-label="إلغاء طلب التوقيع"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </span>
      )
    }
    if (!caseId) return null // طلب التوقيع مربوط بملف (يُسجَّل صادراً عليه)
    return (
      <>
        <button
          type="button"
          onClick={() => setAskOpen(true)}
          title="اطلب توقيع المدير — يصله إشعار، ويُسجَّل الخطاب في الصادر برقمه حين يوقّع"
          className={cn(
            'inline-flex shrink-0 items-center gap-1 rounded-lg border border-gold/50 font-medium text-gold transition-colors hover:bg-gold/10',
            chip
          )}
        >
          <PenLine className="h-3.5 w-3.5" />
          اطلب التوقيع
        </button>
        <Dialog open={askOpen} onOpenChange={(v) => !askM.isPending && setAskOpen(v)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>اطلب توقيع المدير</DialogTitle>
            </DialogHeader>
            <p className="truncate rounded-lg bg-muted px-3 py-2 text-sm">📄 {name}</p>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="ملاحظة للمدير (اختياري) — مثل: الخطاب للمحكمة ويُرسل اليوم"
            />
            <p className="text-xs text-muted-foreground">
              يصل المديرَ إشعارٌ يفتح هذه الرسالة. وحين يوقّع تصل النسخة الموقّعة في الخيط، ويُسجَّل الخطاب في
              الصادر ويُطبع رقمه تحت التوقيع.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAskOpen(false)}>
                إلغاء
              </Button>
              <Button variant="gold" onClick={() => askM.mutate()} disabled={askM.isPending}>
                {askM.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                أرسل الطلب
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </>
    )
  }

  // ---------- المدير: يوقّع ----------
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

  const confirm = async (
    pos: StampPosition,
    mode: ApplyMode,
    sigs: StampPosition[],
    sigPos: { x: number; y: number }
  ) => {
    setBusy(true)
    let letter: { id: string; letter_number: string; letter_date: string | null } | null = null
    let posted: { documentId: string; fileUrl: string } | null = null
    try {
      // ١) الخطاب في الصادر أولاً — رقمه من الخادم (لا يُحسب في المتصفح)
      if (asLetter) {
        const { data, error } = await supabase
          .from('outgoing_letters')
          .insert({
            subject: name.replace(/\.pdf$/i, ''),
            letter_date: todayISO(),
            case_id: caseId,
            created_by: teamMember?.id ?? null,
            file_url: url,
            source_comment_id: messageId,
            notes: 'وُقّع من نقاش الملف',
          })
          .select('id, letter_number, letter_date')
          .single()
        if (error) throw error
        letter = data
      }
      // ٢) الدمج: الختم والتوقيع كلٌّ في موضعه، ورقم الصادر تحت التوقيع
      const blob = await stampPdf(url, {
        stampUrl: mode === 'signature' ? null : stampUrl,
        signatureUrl: mode === 'stamp' ? null : signatureUrl,
        position: pos,
        sigPosition: mode === 'stamp' ? null : sigPos,
        extraSignatures: mode === 'stamp' ? [] : sigs,
        numberLines: letter ? numberLines(letter.letter_number, fmtHijri(letter.letter_date ?? new Date())) : null,
      })
      const base = name.replace(/\.pdf$/i, '')
      const signedName = `${base} - ${mode === 'stamp' ? 'مختوم' : 'موقّع'}${letter ? ` - ${letter.letter_number}` : ''}.pdf`
      const verb = mode === 'stamp' ? 'مختومة' : mode === 'both' ? 'موقّعة ومختومة' : 'موقّعة'
      // ٣) النسخة الموقّعة في الخيط — وفي مستندات المشروع
      posted = await postM.mutateAsync({
        caseId,
        parentId,
        file: new File([blob], signedName, { type: 'application/pdf' }),
        caption: `✍️ نسخة ${verb} من «${name}»${letter ? ` — صادر ${letter.letter_number}` : ''}`,
        description: letter ? `صادر ${letter.letter_number} — نسخة ${verb}` : `نسخة موقّعة من «${name}»`,
      })
      // ٤) النسخة الموقّعة هي النهائية في الصادر، والاعتماد مسجّل بمن طلب ومن وقّع
      if (letter && posted) {
        const now = new Date().toISOString()
        await supabase
          .from('outgoing_letters')
          .update({ file_url: posted.fileUrl, document_id: posted.documentId })
          .eq('id', letter.id)
        await supabase.from('outgoing_approvals').insert({
          letter_id: letter.id,
          status: 'approved',
          original_file_url: url,
          signed_file_url: posted.fileUrl,
          requested_by: request?.requested_by ?? teamMember?.id ?? null,
          requested_at: now,
          approved_by: teamMember?.id ?? null,
          approved_at: now,
          apply_mode: mode,
          stamp_page: pos.page,
          stamp_x: pos.x,
          stamp_y: pos.y,
          sig_pos: mode === 'stamp' ? null : sigPos,
          extra_sigs: mode !== 'stamp' && sigs.length ? sigs : null,
          note: request?.note ?? null,
        })
      }
      if (request) {
        await supabase
          .from('sign_requests')
          .update({ status: 'signed', letter_id: letter?.id ?? null, signed_at: new Date().toISOString() })
          .eq('id', request.id)
      }
      qc.invalidateQueries({ queryKey: ['sign_requests', caseId] })
      qc.invalidateQueries({ queryKey: ['outgoing_letters'] })
      qc.invalidateQueries({ queryKey: ['pending_outgoing_approvals'] })
      if (letter) toast({ variant: 'success', title: `سُجّل في الصادر برقم ${letter.letter_number}` })
      setOpen(false)
    } catch (e) {
      // خطابٌ سُجّل ولم تُرسَل نسخته الموقّعة لا يبقى رقماً معلّقاً بلا ملف (وما أُرسل يبقى مسجّلاً)
      // (الحذف النهائي ممنوع على الصادر — يُحذف حذفاً ليّناً فيبقى أثره)
      if (letter && !posted)
        await supabase
          .from('outgoing_letters')
          .update({ deleted_at: new Date().toISOString(), deleted_by: 'تعذّر التوقيع من النقاش' })
          .eq('id', letter.id)
      toast({ variant: 'destructive', title: 'تعذّر التوقيع', description: errMessage(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <span className="inline-flex shrink-0 flex-col items-start gap-0.5">
        <button
          type="button"
          onClick={start}
          disabled={busy}
          title="وقّع هذا الملف — تُرسل نسخة موقّعة في الخيط ويُسجَّل الخطاب في الصادر برقمه"
          className={cn(
            'inline-flex shrink-0 items-center gap-1 rounded-lg border font-medium transition-colors disabled:opacity-60',
            request ? 'border-gold bg-gold/15 text-gold-700 hover:bg-gold/25 dark:text-gold-300' : 'border-gold/50 text-gold hover:bg-gold/10',
            chip
          )}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PenLine className="h-3.5 w-3.5" />}
          وقّع
        </button>
        {request && (
          <span className="text-[10px] text-amber-700 dark:text-amber-300" title={request.note ?? undefined}>
            ⏳ طلب {requesterName}
            {request.note ? ` — ${request.note}` : ''}
          </span>
        )}
      </span>
      {open && (
        <StampPlacementDialog
          open={open}
          onClose={() => !busy && setOpen(false)}
          fileUrl={url}
          stampUrl={stampUrl}
          signatureUrl={signatureUrl}
          initialMode={signatureUrl ? (stampUrl ? 'both' : 'signature') : 'stamp'}
          numberPreview={asLetter ? numberLines('OUT-··-···', fmtHijri(new Date())) : null}
          onConfirm={confirm}
          confirmLabel={asLetter ? 'وقّع وسجّل في الصادر' : 'وقّع وأرسل في الخيط'}
          confirming={busy}
          headerExtra={
            (
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border/70 px-3 py-1.5 text-xs">
                <input type="checkbox" checked={asLetter} onChange={(e) => setAsLetter(e.target.checked)} className="accent-gold" />
                <Hash className="h-3.5 w-3.5 text-gold" />
                خطاب صادر — يُسجَّل برقمه ويُطبع الرقم تحت التوقيع
              </label>
            )
          }
        />
      )}
    </>
  )
}
