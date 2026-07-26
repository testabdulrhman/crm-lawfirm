// بطاقة سريعة: أدخل جوال العميل ← تُرسَل رسالة شكر على الزيارة مع رابط التقييم
// عبر الواتساب و SMS معاً. النصّ من قالب «شكر بعد الموعد» في الإعدادات.
import { useState } from 'react'
import { Loader2, Send, Star, Check, X } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/hooks/use-toast'
import { useSendThankYou, type ThankYouResult } from '@/hooks/useThankYou'
import { errMessage } from '@/lib/errors'

export function ThankYouCard() {
  const [phone, setPhone] = useState('')
  const [last, setLast] = useState<ThankYouResult | null>(null)
  const sendM = useSendThankYou()

  const submit = () => {
    if (phone.trim() === '' || sendM.isPending) return
    setLast(null)
    sendM.mutate(phone.trim(), {
      onSuccess: (r) => {
        setLast(r)
        setPhone('')
        if (r.whatsapp || r.sms)
          toast({ variant: 'success', title: `أُرسلت الرسالة إلى ${r.name}` })
        else
          toast({
            variant: 'destructive',
            title: 'تعذّر الإرسال على القناتين',
            description: 'راجع اتصال بوابة الواتساب ورصيد الرسائل.',
          })
      },
      onError: (e) =>
        toast({
          variant: 'destructive',
          title: 'تعذّر الإرسال',
          description: errMessage(e),
        }),
    })
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2.5 space-y-0 px-5 pb-3 pt-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gold/10">
          <Star className="h-[18px] w-[18px] text-gold" />
        </span>
        <CardTitle className="text-[15px] font-semibold">شكر وتقييم</CardTitle>
      </CardHeader>

      <CardContent className="space-y-2.5 px-5 pb-5">
        <div className="flex gap-2">
          <Input
            dir="ltr"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="05xxxxxxxx"
          />
          <Button
            variant="gold"
            className="shrink-0"
            onClick={submit}
            disabled={sendM.isPending || phone.trim() === ''}
          >
            {sendM.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            إرسال
          </Button>
        </div>

        {last ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="text-muted-foreground">{last.name}</span>
            <Channel ok={last.whatsapp} label="واتساب" />
            <Channel ok={last.sms} label="SMS" />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            شكر على الزيارة مع رابط التقييم — يُرسَل واتساب و SMS معاً.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function Channel({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={
        ok
          ? 'flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400'
          : 'flex items-center gap-1 font-medium text-destructive'
      }
    >
      {ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
      {label}
    </span>
  )
}
