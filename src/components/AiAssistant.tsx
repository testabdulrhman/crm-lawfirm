// المساعد الذكي — زر عائم يفتح محادثة تنفيذية (بحث + إجراءات) عبر ai-assistant (task: agent)
import { useEffect, useRef, useState } from 'react'
import { Sparkles, X, Send, Loader2, CheckCircle2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import { toast } from '@/hooks/use-toast'

interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
  actions?: string[]
}

const WELCOME =
  'مرحباً! أنا المساعد الذكي للمكتب. اسألني عن الوكالات والقضايا وجهات الاتصال، أو اطلب مني إجراءً مثل:\n«الوكالة 466650258 منتهية، أرسل لصاحبها طلب إعادة إصدار وكالة»'

export function AiAssistant() {
  const { teamMember } = useAuth()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // تمرير لأسفل عند كل رسالة
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, busy, open])

  const send = async () => {
    const text = input.trim()
    if (!text || busy) return
    const next: ChatMsg[] = [...messages, { role: 'user', content: text }]
    setMessages(next)
    setInput('')
    setBusy(true)
    try {
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: {
          task: 'agent',
          payload: {
            user_name: teamMember?.name ?? 'موظف',
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
        },
      ])
    } catch {
      toast({ variant: 'destructive', title: 'تعذّر الاتصال بالمساعد، حاول مرة أخرى' })
      setMessages(next) // تبقى رسالتك لتعيد الإرسال
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {/* الزر العائم */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="المساعد الذكي"
        className={cn(
          'fixed bottom-5 left-5 z-40 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105',
          'bg-gradient-to-br from-violet-600 to-violet-800 text-white',
          open && 'scale-0'
        )}
      >
        <Sparkles className="h-6 w-6" />
      </button>

      {/* لوحة المحادثة */}
      {open && (
        <div className="fixed inset-x-2 bottom-2 z-50 flex max-h-[85vh] flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl sm:inset-x-auto sm:bottom-5 sm:left-5 sm:h-[560px] sm:w-[400px]">
          {/* الرأس */}
          <div className="flex items-center justify-between gap-2 border-b bg-gradient-to-l from-violet-600 to-violet-800 px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              <div>
                <p className="text-sm font-bold">المساعد الذكي</p>
                <p className="text-[11px] opacity-80">يبحث ويرسل الرسائل وينشئ المهام</p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded-full p-1 hover:bg-white/15"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* الرسائل */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-3">
            {messages.length === 0 && (
              <div className="rounded-xl bg-violet-50 p-3 text-sm leading-relaxed text-foreground dark:bg-violet-950/30">
                <p className="whitespace-pre-wrap">{WELCOME}</p>
              </div>
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
          </div>

          {/* الإدخال */}
          <div className="border-t p-2">
            <div className="flex items-end gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
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
                className="h-10 w-10 shrink-0 bg-violet-600 text-white hover:bg-violet-700"
                disabled={busy || input.trim() === ''}
                onClick={send}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <p className="mt-1 px-1 text-[10px] text-muted-foreground">
              مساعد ذكي — راجِع الإجراءات الحسّاسة قبل طلب تنفيذها.
            </p>
          </div>
        </div>
      )}
    </>
  )
}
