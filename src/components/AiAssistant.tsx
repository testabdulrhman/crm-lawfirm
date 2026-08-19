// المساعد الذكي — زر عائم يفتح محادثة تنفيذية (بحث + إجراءات) عبر ai-assistant (task: agent)
import { useEffect, useRef, useState } from 'react'
import {
  Sparkles,
  X,
  Send,
  Loader2,
  CheckCircle2,
  ArrowLeft,
  Paperclip,
  FileText,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { isNative } from '@/lib/push'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import { toast } from '@/hooks/use-toast'
import { pickFile, uploadFile } from '@/lib/files'
import { errMessage } from '@/lib/errors'

interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
  actions?: string[]
  suggestions?: string[]
}

// ملف أرفقه الموظف في المحادثة (يُرفع للتخزين فور اختياره)
interface Attachment {
  url: string
  name: string
  type: string | null
}

// شاشة لمسية بلا مؤشر دقيق (آيفون) — يتغير سلوك Enter في حقل الكتابة
const isCoarsePointer = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(pointer: coarse)').matches

const WELCOME =
  'مرحباً! أنا المساعد الذكي للمكتب. اسألني عن الوكالات والقضايا وجهات الاتصال، أو اطلب مني إجراءً مثل:\n«الوكالة 466650258 منتهية، أرسل لصاحبها طلب إعادة إصدار وكالة»'

// اقتراحات البداية (قبل أول رسالة)
const STARTERS = [
  'ما جلساتي هذا الأسبوع؟',
  'المهام المتأخرة',
  'وكالات تنتهي خلال شهر',
  'من أفضل المتقدمين للوظائف؟',
]

export function AiAssistant() {
  const { teamMember } = useAuth()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [attachment, setAttachment] = useState<Attachment | null>(null)
  const [uploading, setUploading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // تمرير لأسفل عند كل رسالة
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, busy, open])

  // إغلاق اللوحة بـ Escape (اللوحة ليست Dialog نمطياً)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  // اختيار ملف ورفعه للتخزين — يبقى معلّقاً حتى ترسل الرسالة
  const attachFile = async () => {
    const f = await pickFile()
    if (!f) return
    setUploading(true)
    try {
      const { publicUrl } = await uploadFile(f, { folder: 'assistant' })
      setAttachment({ url: publicUrl, name: f.name, type: f.type || null })
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'تعذّر رفع الملف',
        description: errMessage(e),
      })
    } finally {
      setUploading(false)
    }
  }

  // الإرسال — يقبل نصّاً مباشراً (من زر اقتراح) أو يأخذ ما في حقل الكتابة
  const send = async (preset?: string) => {
    const text = (preset ?? input).trim()
    // المرفق وحده يكفي للإرسال (بنص افتراضي)
    if ((!text && !attachment) || busy) return
    const shown = text || `أرفقت ملفاً: ${attachment?.name}`
    // نحتفظ بهما محلياً لإرجاعهما لحقل الكتابة عند فشل الإرسال
    const sentAttachment = attachment
    const next: ChatMsg[] = [
      ...messages,
      {
        role: 'user',
        content: attachment ? `${shown}\n📎 ${attachment.name}` : shown,
      },
    ]
    setMessages(next)
    setInput('')
    setAttachment(null)
    setBusy(true)
    try {
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: {
          task: 'agent',
          payload: {
            user_name: teamMember?.name ?? 'موظف',
            attachment,
            messages: next.map((m) => ({ role: m.role, content: m.content })),
          },
        },
      })
      if (error || data?.error) throw new Error(data?.error || 'فشل الطلب')
      setMessages([
        ...next,
        {
          role: 'assistant',
          content: String(data?.text ?? 'تم.'),
          actions: Array.isArray(data?.actions) ? data.actions : [],
          suggestions: Array.isArray(data?.suggestions) ? data.suggestions : [],
        },
      ])
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'تعذّر الاتصال بالمساعد',
        description: errMessage(e),
      })
      // نعيد النص والمرفق لحقل الكتابة ليعيد الإرسال دون إعادة كتابة —
      // إلا إذا كتب المستخدم شيئاً جديداً أثناء الانتظار فلا نمحوه
      setMessages(messages)
      setInput((cur) => (cur.trim() !== '' ? cur : text))
      setAttachment((cur) => cur ?? sentAttachment)
    } finally {
      setBusy(false)
    }
  }

  // اقتراحات آخر رد فقط (تختفي بمجرد إرسال رسالة جديدة)
  const last = messages[messages.length - 1]
  const liveSuggestions =
    !busy && last?.role === 'assistant' ? (last.suggestions ?? []) : []

  return (
    <>
      {/* الزر العائم */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="المساعد الذكي"
        className={cn(
          'fixed left-5 z-40 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105',
          // داخل التطبيق يرتفع فوق شريط التبويبات السفلي فلا يختفي خلفه
          isNative() ? 'bottom-[5.5rem]' : 'bottom-5',
          'bg-gradient-to-br from-violet-600 to-violet-800 text-white',
          open && 'scale-0'
        )}
      >
        <Sparkles className="h-6 w-6" />
      </button>

      {/* لوحة المحادثة */}
      {open && (
        <div
          role="dialog"
          aria-label="المساعد الذكي"
          className={cn(
            'fixed inset-x-2 z-50 flex max-h-[85vh] flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl sm:inset-x-auto sm:bottom-5 sm:left-5 sm:h-[560px] sm:w-[400px]',
            isNative() ? 'bottom-[4.75rem]' : 'bottom-2'
          )}
        >
          {/* الرأس */}
          <div className="flex items-center justify-between gap-2 border-b bg-gradient-to-l from-violet-600 to-violet-800 px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              <div>
                <p className="text-sm font-bold">المساعد الذكي</p>
                <p className="text-xs opacity-80">يبحث ويرسل الرسائل وينشئ المهام</p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="إغلاق المساعد"
              className="-m-1 rounded-full p-2 hover:bg-white/15"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* الرسائل */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-3">
            {messages.length === 0 && (
              <>
                <div className="rounded-xl bg-violet-50 p-3 text-sm leading-relaxed text-foreground dark:bg-violet-950/30">
                  <p className="whitespace-pre-wrap">{WELCOME}</p>
                </div>
                <SuggestionChips items={STARTERS} onPick={send} />
              </>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  'max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm leading-relaxed',
                  m.role === 'user'
                    ? 'mr-auto bg-gold/20 text-foreground'
                    : 'ml-auto bg-muted text-foreground'
                )}
              >
                {m.content}
                {m.actions && m.actions.length > 0 && (
                  <div className="mt-2 space-y-1 border-t pt-2">
                    {m.actions.map((a, j) => (
                      <p
                        key={j}
                        className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                        {a}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {busy && (
              <div className="ml-auto flex max-w-[85%] items-center gap-2 rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                يعمل على طلبك…
              </div>
            )}
            {/* اقتراحات المتابعة — ضغطة واحدة تُرسلها */}
            {liveSuggestions.length > 0 && (
              <SuggestionChips items={liveSuggestions} onPick={send} />
            )}
          </div>

          {/* الإدخال */}
          <div className="border-t p-2">
            {/* المرفق المعلّق قبل الإرسال */}
            {attachment && (
              <div className="mb-2 flex items-center gap-2 rounded-lg border bg-muted/40 px-2 py-1.5">
                <FileText className="h-4 w-4 shrink-0 text-violet-600" />
                <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                  {attachment.name}
                </span>
                <button
                  onClick={() => setAttachment(null)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="إزالة المرفق"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <div className="flex items-end gap-2">
              <Button
                size="icon"
                variant="outline"
                className="h-10 w-10 shrink-0"
                disabled={busy || uploading}
                onClick={attachFile}
                title="إرفاق ملف (ضبط جلسة، حكم، مستند…)"
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Paperclip className="h-4 w-4" />
                )}
              </Button>
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  // على الشاشات اللمسية (لا Shift في كيبورد iOS) زر الرجوع
                  // يُدرج سطراً جديداً والإرسال بزر الإرسال فقط
                  if (e.key === 'Enter' && !e.shiftKey && !isCoarsePointer()) {
                    e.preventDefault()
                    send()
                  }
                }}
                placeholder="اكتب طلبك…"
                rows={1}
                className="max-h-28 min-h-[2.5rem] flex-1 resize-none"
              />
              <Button
                size="icon"
                aria-label="إرسال"
                className="h-10 w-10 shrink-0 bg-violet-600 text-white hover:bg-violet-700"
                disabled={busy || uploading || (input.trim() === '' && !attachment)}
                onClick={() => send()}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <p className="mt-1 px-1 text-xs text-muted-foreground">
              مساعد ذكي — راجِع الإجراءات الحسّاسة قبل طلب تنفيذها.
            </p>
          </div>
        </div>
      )}
    </>
  )
}

// أزرار اقتراحات: الضغط يرسل الاقتراح مباشرة
function SuggestionChips({
  items,
  onPick,
}: {
  items: string[]
  onPick: (text: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5 pt-0.5">
      {items.map((s, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onPick(s)}
          className="flex items-center gap-1 rounded-full border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700 transition-colors hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300 dark:hover:bg-violet-900/50"
        >
          {s}
          <ArrowLeft className="h-3 w-3 shrink-0 opacity-60" />
        </button>
      ))}
    </div>
  )
}
