// «خبر اليوم» في لوحة التحكم (قرار المدير 2026-10-08: للفريق داخل التطبيق فقط). دالة daily-news تختار كل صباح
// خبراً واحداً من أساب للنشر وتكتب «لماذا يهمّنا» — وإن لم يكن في اليوم ما يخصنا فلا بطاقة. هادئة: بلا إشعار،
// وتُغلق ليومها، ورابط «أخبار سابقة» يفتح ما مضى.
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ExternalLink, History, Newspaper, X } from 'lucide-react'

import { supabase } from '@/lib/supabase'
import { openExternal } from '@/lib/external'
import { fmtDatePref, localISO } from '@/lib/format'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export interface DailyNews {
  id: string
  day: string
  title: string
  category: string | null
  url: string
  why: string
}

const COLS = 'id, day, title, category, url, why'

function useDailyNews(limit: number, enabled = true) {
  return useQuery({
    queryKey: ['daily_news', limit],
    enabled,
    staleTime: 30 * 60 * 1000,
    queryFn: async (): Promise<DailyNews[]> => {
      const { data, error } = await supabase.from('daily_news').select(COLS).order('day', { ascending: false }).limit(limit)
      if (error) throw error
      return (data ?? []) as DailyNews[]
    },
  })
}

const dismissKey = (day: string) => `news-dismissed:${day}`
function isDismissed(day: string): boolean {
  try {
    return localStorage.getItem(dismissKey(day)) === '1'
  } catch {
    return false
  }
}

export function DailyNewsCard() {
  const { data } = useDailyNews(1)
  const [closed, setClosed] = useState<string | null>(null)
  const [archive, setArchive] = useState(false)

  const news = data?.[0]
  // خبر اليوم أو الأمس (قبل اختيار الصباح أو يوم بلا خبر يبقى خبر الأمس) — وما أقدم من ذلك لا يُعرض
  const yesterday = localISO(new Date(Date.now() - 86400000))
  if (!news || news.day < yesterday || closed === news.day || isDismissed(news.day)) {
    return archive ? <NewsArchive open onOpenChange={setArchive} /> : null
  }

  const close = () => {
    try {
      localStorage.setItem(dismissKey(news.day), '1')
    } catch {
      /* التخزين محجوب — يُغلق للجلسة وحدها */
    }
    setClosed(news.day)
  }

  return (
    <>
      <div className="relative rounded-2xl border bg-card py-4 pe-12 ps-5">
        <button
          type="button"
          onClick={close}
          aria-label="إغلاق"
          title="إغلاق لليوم"
          className="absolute end-2 top-2 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-gold-700 dark:text-gold-300">
            <Newspaper className="h-4 w-4" />
            خبر اليوم
          </span>
          {news.category && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{news.category}</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => openExternal(news.url)}
          className="text-start text-base font-semibold leading-relaxed text-foreground hover:text-gold-700 dark:hover:text-gold-300"
        >
          {news.title}
        </button>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          <span className="font-medium text-gold-700 dark:text-gold-300">لماذا يهمّنا: </span>
          {news.why}
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>المصدر: أساب للنشر</span>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setArchive(true)} className="inline-flex items-center gap-1 hover:text-foreground">
              <History className="h-3.5 w-3.5" />
              أخبار سابقة
            </button>
            <button
              type="button"
              onClick={() => openExternal(news.url)}
              className="inline-flex items-center gap-1 font-medium text-gold-700 hover:underline dark:text-gold-300"
            >
              اقرأ الخبر كاملاً
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
      {archive && <NewsArchive open onOpenChange={setArchive} />}
    </>
  )
}

function NewsArchive({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data, isLoading } = useDailyNews(30, open)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Newspaper className="h-5 w-5 text-gold" />
            أخبار سابقة
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">جارٍ التحميل…</p>
        ) : !data?.length ? (
          <p className="py-6 text-center text-sm text-muted-foreground">لا أخبار بعد — يُختار أول خبر صباح الغد.</p>
        ) : (
          <ul className="divide-y">
            {data.map((n) => (
              <li key={n.id} className="py-3">
                <p className="mb-1 text-xs text-muted-foreground">
                  {fmtDatePref(n.day)}
                  {n.category ? ` · ${n.category}` : ''}
                </p>
                <button
                  type="button"
                  onClick={() => openExternal(n.url)}
                  className="text-start text-sm font-semibold leading-relaxed text-foreground hover:text-gold-700 dark:hover:text-gold-300"
                >
                  {n.title}
                </button>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{n.why}</p>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">المصدر: أساب للنشر · يُختار خبر واحد كل صباح يخص عمل المكتب</p>
      </DialogContent>
    </Dialog>
  )
}
