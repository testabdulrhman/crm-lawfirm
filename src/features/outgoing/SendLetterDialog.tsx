// إرسال ملف الخطاب للعميل عبر الواتساب (بوابة Evolution عبر whatsapp-send).
// يُرسل الملف نفسه مرفقاً مع نصّ مرافق قابل للتحرير.
import { useEffect, useState } from 'react'
import { MessageCircle, Loader2, Paperclip } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import { normalizeSaudiPhone } from '@/lib/format'
import { COMPANY_NAME } from '@/lib/constants'
import type { OutgoingLetter } from '@/types/db'
import { errMessage } from '@/lib/errors'

export function SendLetterDialog({
  letter: l,
  open,
  onOpenChange,
}: {
  letter: OutgoingLetter
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const clientPhone = l.case?.contact?.phone ?? ''
  const clientName = l.case?.contact?.name ?? l.recipient ?? ''

  const [phone, setPhone] = useState(clientPhone)
  const [name, setName] = useState(clientName)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  // تعبئة القيم عند كل فتح (قد تتغيّر بيانات الخطاب)
  useEffect(() => {
    if (!open) return
    setPhone(clientPhone)
    setName(clientName)
    setMessage(
      `${clientName ? clientName + '،\n' : ''}` +
        `نرفق لكم ${l.subject || 'الخطاب'}${l.letter_number ? ` (${l.letter_number})` : ''}.\n` +
        COMPANY_NAME
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const fileName = `${(l.letter_number || 'letter').replace(/[^\w-]+/g, '_')}.pdf`

  const send = async () => {
    const intl = normalizeSaudiPhone(phone)
    if (intl.length !== 12 || !intl.startsWith('9665')) {
      toast({
        variant: 'destructive',
        title: 'رقم جوال غير صحيح',
        description: 'أدخل رقماً سعوديّاً مثل 0501234567',
      })
      return
    }
    if (!l.file_url) return
    setSending(true)
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-send', {
        body: {
          phone: intl,
          message: message.trim(),
          recipient_name: name || 'عميل',
          media_url: l.file_url,
          file_name: fileName,
        },
      })
      if (error || data?.error) throw new Error(data?.error || 'فشل الإرسال')
      toast({
        variant: 'success',
        title: `أُرسل الخطاب واتساب إلى ${name || intl}`,
      })
      onOpenChange(false)
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'تعذّر الإرسال عبر الواتساب',
        description:
          errMessage(e) ?? 'تحقّق من الرقم واتصال البوابة.',
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>إرسال الخطاب واتساب</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* الملف المرفق */}
          <div className="flex items-center gap-2 rounded-xl border bg-muted/40 px-3 py-2">
            <Paperclip className="h-4 w-4 shrink-0 text-gold" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {l.subject || 'خطاب صادر'}
              </p>
              <p dir="ltr" className="truncate text-right text-xs text-muted-foreground">
                {fileName}
                {l.approval?.status === 'approved' ? ' — النسخة الموقّعة' : ''}
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wa_phone">جوال المستلِم *</Label>
            <Input
              id="wa_phone"
              dir="ltr"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="05xxxxxxxx"
            />
            {!clientPhone && (
              <p className="text-xs text-muted-foreground">
                لا يوجد جوال محفوظ للعميل — أدخله يدوياً.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wa_name">اسم المستلِم (للسجل)</Label>
            <Input
              id="wa_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wa_msg">النص المرافق</Label>
            <Textarea
              id="wa_msg"
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="gold"
            onClick={send}
            disabled={sending || phone.trim() === ''}
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MessageCircle className="h-4 w-4" />
            )}
            إرسال
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
