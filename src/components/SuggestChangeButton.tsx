// «اقترح تعديلاً» — زرّ في الشريط العلوي لكل صفحة (طلب المدير 2026-09-24: «فيه طريقة اقدر
// اعدل في النظام من داخل النظام نفسه؟»). اللقطة تُلتقط **قبل** فتح النافذة، وإلا صُوّرت
// النافذة نفسها فوق الصفحة. ومعها مسار الصفحة وعنوانها فلا يحتاج صاحب الطلب وصف «أين كنت».
import { useState } from 'react'
import { useLocation } from 'wouter'
import html2canvas from 'html2canvas'
import { Lightbulb, Loader2, MapPin, Send } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ROUTE_TITLES } from '@/lib/constants'
import { useCreateChangeRequest } from '@/hooks/useChangeRequests'

/** عنوان الصفحة: من جدول العناوين، وإلا عنوان المستند (صفحات التفاصيل) */
function pageTitleOf(path: string): string {
  if (ROUTE_TITLES[path]) return ROUTE_TITLES[path]
  const base = '/' + (path.split('/')[1] ?? '')
  const t = ROUTE_TITLES[base]
  return t ? `${t} (تفاصيل)` : document.title
}

/** ما يراه الموظف الآن فقط (لا الصفحة كلها) — مصغّراً وJPEG ليبقى خفيفاً */
async function captureViewport(): Promise<Blob | null> {
  try {
    const canvas = await html2canvas(document.body, {
      x: window.scrollX,
      y: window.scrollY,
      width: window.innerWidth,
      height: window.innerHeight,
      scale: Math.min(1, 1400 / window.innerWidth),
      useCORS: true,
      logging: false,
    })
    return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.72))
  } catch {
    return null // اللقطة تحسين لا شرط
  }
}

export function SuggestChangeButton() {
  const [location] = useLocation()
  const create = useCreateChangeRequest()
  const [capturing, setCapturing] = useState(false)
  const [open, setOpen] = useState(false)
  const [body, setBody] = useState('')
  const [shot, setShot] = useState<Blob | null>(null)
  const [shotUrl, setShotUrl] = useState<string | null>(null)
  const [attachShot, setAttachShot] = useState(true)
  const [ctx, setCtx] = useState({ path: '/', title: '' })

  const start = async () => {
    setCapturing(true)
    const blob = await captureViewport()
    setCapturing(false)
    setCtx({ path: location, title: pageTitleOf(location) })
    setShot(blob)
    setShotUrl((old) => {
      if (old) URL.revokeObjectURL(old)
      return blob ? URL.createObjectURL(blob) : null
    })
    setAttachShot(!!blob)
    setOpen(true)
  }

  const close = (v: boolean) => {
    setOpen(v)
    if (!v && !create.isPending) setBody('')
  }

  const submit = () => {
    if (!body.trim() || create.isPending) return
    create.mutate(
      { body, pagePath: ctx.path, pageTitle: ctx.title, screenshot: attachShot ? shot : null },
      {
        onSuccess: () => {
          setOpen(false)
          setBody('')
        },
      }
    )
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={start}
        disabled={capturing}
        aria-label="اقترح تعديلاً على هذه الصفحة"
        title="اقترح تعديلاً على هذه الصفحة"
      >
        {capturing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Lightbulb className="h-5 w-5" />}
      </Button>

      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-gold" />
              اقترح تعديلاً
            </DialogTitle>
            <DialogDescription>
              اكتب ما تريد أن يتغيّر أو يُضاف. يصلك إشعار حين يُنفَّذ أو يُردّ عليه.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 text-gold" />
              <span className="font-medium text-foreground">{ctx.title}</span>
              <span dir="ltr" className="truncate font-mono">{ctx.path}</span>
            </div>

            <Textarea
              autoFocus
              rows={5}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
              }}
              placeholder="مثال: ودي زرّ يطبع هذا الجدول، أو: الرقم هنا يظهر خطأ…"
            />

            {shotUrl && (
              <div className="space-y-2 rounded-xl border bg-muted/30 p-2">
                <label className="flex cursor-pointer items-center justify-between gap-2 text-xs text-foreground">
                  أرفق لقطة من الصفحة كما هي الآن
                  <Switch checked={attachShot} onCheckedChange={setAttachShot} />
                </label>
                {attachShot && (
                  <img
                    src={shotUrl}
                    alt="لقطة الصفحة"
                    className="max-h-40 w-full rounded-lg border object-cover object-top"
                  />
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="gold" onClick={submit} disabled={!body.trim() || create.isPending}>
              {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              إرسال
            </Button>
            <Button variant="outline" onClick={() => close(false)}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
