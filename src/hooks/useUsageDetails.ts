// تفاصيل الاستخدام (آخر 30 يوماً) من usage_daily: الوقت في كل صفحة + أكثر الأزرار ضغطاً
import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { ROUTE_TITLES } from '@/lib/constants'

interface DailyRow {
  user_name: string
  event_type: string
  page: string
  label: string | null
  hits: number
  seconds: number
}

export interface PageUsage {
  page: string
  title: string
  opens: number
  seconds: number
}

export interface ButtonUsage {
  label: string
  page: string
  pageTitle: string
  hits: number
}

// عنوان عربي مقروء للمسار المطبَّع (/cases/:id → «القضايا — تفاصيل»)
export function pageTitle(page: string): string {
  const clean = page.replace(/\/$/, '') || '/'
  if (clean === '/') return 'لوحة التحكم'
  const base = '/' + (clean.split('/')[1] ?? '')
  const t = ROUTE_TITLES[base]
  if (!t) return clean
  return clean.includes(':id') ? `${t} — تفاصيل` : t
}

export function useUsageDetails(userFilter: string) {
  return useQuery({
    queryKey: ['usage-details', userFilter],
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 86400000)
        .toISOString()
        .slice(0, 10)
      let q = supabase
        .from('usage_daily')
        .select('user_name, event_type, page, label, hits, seconds')
        .gte('day', since)
        .limit(20000)
      if (userFilter !== 'all') q = q.eq('user_name', userFilter)
      const { data, error } = await q
      if (error) throw error
      const rows = (data ?? []) as DailyRow[]

      const users = new Set<string>()
      const pages = new Map<string, PageUsage>()
      const buttons = new Map<string, ButtonUsage>()

      for (const r of rows) {
        users.add(r.user_name)
        if (r.event_type === 'page') {
          const p = pages.get(r.page) ?? {
            page: r.page,
            title: pageTitle(r.page),
            opens: 0,
            seconds: 0,
          }
          p.opens += r.hits
          p.seconds += r.seconds
          pages.set(r.page, p)
        } else if (r.event_type === 'click' && r.label) {
          const key = `${r.label}|${r.page}`
          const b = buttons.get(key) ?? {
            label: r.label,
            page: r.page,
            pageTitle: pageTitle(r.page),
            hits: 0,
          }
          b.hits += r.hits
          buttons.set(key, b)
        }
      }

      return {
        users: [...users].sort(),
        pages: [...pages.values()].sort((a, b) => b.seconds - a.seconds),
        buttons: [...buttons.values()].sort((a, b) => b.hits - a.hits),
      }
    },
  })
}
