// «أحِل للنقاش» — خطاب صادر يُرسَل لنقاش مشروع (طلب المدير 2026-10-07: «ودي إذا وقعت في الصادر مثلاً أقدر
// أحيل الملف للنقاش في مشروع، وأكيد بيكون موجود في مستندات المشروع»). يُرسل الملف (الموقّع إن وُقّع) مرفقاً
// في نقاش المشروع المختار — فيُحفظ في مستنداته أيضاً — ويُربط الخطاب بالمشروع إن لم يكن مربوطاً.
import { useState } from 'react'
import { useLocation } from 'wouter'
import { Loader2, MessagesSquare, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Ltr } from '@/components/Ltr'
import { usePostAttachment } from '@/hooks/useDiscussions'
import { useLinkableMatters } from '@/hooks/useClientChats'
import { requestDiscussionJump } from '@/lib/discussionJump'
import { matterKindEmoji } from '@/lib/matterHref'
import { supabase } from '@/lib/supabase'
import { errMessage } from '@/lib/errors'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import type { OutgoingLetter } from '@/types/db'

export function ReferToDiscussionDialog({
  letter: l,
  open,
  onOpenChange,
}: {
  letter: OutgoingLetter
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [, navigate] = useLocation()
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<string | null>(l.case_id ?? null)
  const [busy, setBusy] = useState(false)
  const { data: matters, isLoading } = useLinkableMatters(q)
  const postM = usePostAttachment()
  const signed = l.approval?.status === 'approved'

  const send = async () => {
    if (!picked || !l.file_url) return
    setBusy(true)
    try {
      const res = await fetch(l.file_url)
      if (!res.ok) throw new Error('تعذّر جلب ملف الخطاب')
      const blob = await res.blob()
      const num = l.letter_number ?? ''
      const subject = (l.subject ?? 'خطاب').replace(/[\\/:*?"<>|]+/g, ' ').trim()
      const ext = /\.pdf(\?|$)/i.test(l.file_url) || blob.type === 'application/pdf' ? 'pdf' : (l.file_url.split('?')[0].split('.').pop() ?? 'pdf')
      await postM.mutateAsync({
        caseId: picked,
        file: new File([blob], `${num ? `${num} - ` : ''}${subject}.${ext}`, { type: blob.type || 'application/pdf' }),
        caption: `📤 صادر ${num}${l.subject ? ` — ${l.subject}` : ''}${signed ? ' (موقّع)' : ''}`,
        description: `صادر ${num}`.trim(),
      })
      if (!l.case_id) await supabase.from('outgoing_letters').update({ case_id: picked }).eq('id', l.id)
      onOpenChange(false)
      requestDiscussionJump({ caseId: picked })
      navigate('/discussions')
    } catch (e) {
      toast({ variant: 'destructive', title: 'لم يُحَل الخطاب', description: errMessage(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>أحِل الخطاب لنقاش مشروع</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          يُرسل {signed ? 'الخطاب الموقّع' : 'ملف الخطاب'} مرفقاً في نقاش المشروع، ويُحفظ في مستنداته.
        </p>
        <div className="relative">
          <Search className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="رقم الملف أو عنوانه" className="pr-8" />
        </div>
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {isLoading ? (
            <p className="py-4 text-center text-sm text-muted-foreground">جارٍ البحث…</p>
          ) : !matters?.length ? (
            <p className="py-4 text-center text-sm text-muted-foreground">لا مشاريع مطابقة</p>
          ) : (
            matters.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setPicked(m.id)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-right text-sm transition-colors hover:bg-muted',
                  picked === m.id ? 'border-gold bg-gold/10' : 'border-border/60'
                )}
              >
                <span>{matterKindEmoji(m.kind)}</span>
                <Ltr className="shrink-0 text-xs font-medium">{m.office_num ?? '—'}</Ltr>
                <span className="min-w-0 flex-1 truncate">{m.title ?? 'بلا عنوان'}</span>
                {m.id === l.case_id && <span className="shrink-0 text-[11px] text-gold-700">مشروع الخطاب</span>}
              </button>
            ))
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            إلغاء
          </Button>
          <Button variant="gold" onClick={send} disabled={!picked || busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessagesSquare className="h-4 w-4" />}
            أحِل للنقاش
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
