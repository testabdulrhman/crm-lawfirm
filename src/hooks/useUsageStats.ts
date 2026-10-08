// إحصاءات استخدام التطبيق من usage_sessions لفترة يختارها المدير (٧/١٤/٣٠/٩٠ يوماً) — تجميع في المتصفح
import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'

export interface UsageSessionRow {
  user_name: string
  user_role: string | null
  login_at: string
  minutes: number | null
  updated_at: string | null
}

export interface UserUsage {
  name: string
  role: string | null
  sessions: number
  minutes: number
  lastLogin: string
}

export interface DayUsage {
  day: string // YYYY-MM-DD
  label: string // اسم يوم مختصر + تاريخ
  minutes: number
  webMinutes: number
  iosMinutes: number
}

export interface TopItem {
  name: string
  value: number // ثوانٍ للشاشات، نقرات للأزرار
}

export interface UsageStats {
  activeToday: number
  periodSessions: number
  periodMinutes: number
  webShare: number // نسبة دقائق الويب خلال الفترة ٪
  byUser: UserUsage[]
  byDay: DayUsage[] // يوماً بيوم خلال الفترة
  topScreens: TopItem[] // بالدقائق
  topActions: TopItem[] // بالنقرات
}

export const USAGE_PERIODS = [7, 14, 30, 90] as const

// PostgREST يقطع عند ١٠٠٠ صف — usage_daily يتجاوزها في أسبوعين، فنقرأ صفحةً صفحة
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchAllRows<T>(build: (from: number, to: number) => PromiseLike<{ data: any; error: any }>): Promise<T[]> {
  const PAGE = 1000
  const out: T[] = []
  for (let from = 0; from < 50000; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) throw error
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < PAGE) break
  }
  return out
}

export function useUsageStats(days: number) {
  return useQuery({
    queryKey: ['usage-stats', days],
    queryFn: async (): Promise<UsageStats> => {
      const since = new Date(Date.now() - days * 86400000).toISOString()
      const sinceDay = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10)
      const [rows, dailyRows] = await Promise.all([
        fetchAllRows<UsageSessionRow & { platform?: string }>((a, b) =>
          supabase
            .from('usage_sessions')
            .select('user_name, user_role, login_at, minutes, updated_at, platform')
            .gte('login_at', since)
            .order('login_at', { ascending: false })
            .range(a, b)
        ),
        fetchAllRows<{
          event_type: string
          page: string | null
          label: string | null
          hits: number | null
          seconds: number | null
        }>((a, b) =>
          supabase
            .from('usage_daily')
            .select('event_type, page, label, hits, seconds')
            .gte('day', sinceDay)
            .order('day')
            .range(a, b)
        ),
      ])

      const todayStr = new Date().toISOString().slice(0, 10)

      const activeTodaySet = new Set<string>()
      let periodSessions = 0
      let periodMinutes = 0
      let periodWebMinutes = 0
      const users = new Map<string, UserUsage>()
      const dayMap = new Map<string, { total: number; web: number; ios: number }>()

      for (const r of rows) {
        const mins = r.minutes ?? 0
        const day = r.login_at.slice(0, 10)
        if (day === todayStr) activeTodaySet.add(r.user_name)
        periodSessions++
        periodMinutes += mins
        if ((r.platform ?? 'web') === 'web') periodWebMinutes += mins
        const u = users.get(r.user_name)
        if (u) {
          u.sessions++
          u.minutes += mins
          if (r.login_at > u.lastLogin) u.lastLogin = r.login_at
        } else {
          users.set(r.user_name, {
            name: r.user_name,
            role: r.user_role,
            sessions: 1,
            minutes: mins,
            lastLogin: r.login_at,
          })
        }
        const d = dayMap.get(day) ?? { total: 0, web: 0, ios: 0 }
        d.total += mins
        if ((r.platform ?? 'web') === 'ios') d.ios += mins
        else d.web += mins
        dayMap.set(day, d)
      }

      // أكثر الشاشات (بالثواني) وأكثر الأفعال (بالنقرات) خلال الفترة
      const screens = new Map<string, number>()
      const actions = new Map<string, number>()
      for (const r of dailyRows) {
        if (r.event_type === 'page' && r.page) {
          screens.set(r.page, (screens.get(r.page) ?? 0) + (r.seconds ?? 0))
        } else if (r.event_type === 'click' && r.label) {
          actions.set(r.label, (actions.get(r.label) ?? 0) + (r.hits ?? 0))
        }
      }
      const topScreens = [...screens.entries()]
        .map(([name, secs]) => ({ name, value: Math.round(secs / 60) }))
        .filter((t) => t.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 8)
      const topActions = [...actions.entries()]
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8)

      // أيام الفترة متتالية (حتى الأيام بلا استخدام تظهر صفراً)
      const byDay: DayUsage[] = []
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000)
        const key = d.toISOString().slice(0, 10)
        const v = dayMap.get(key)
        byDay.push({
          day: key,
          label: days > 14 ? `${d.getMonth() + 1}/${d.getDate()}` : d.toLocaleDateString('ar', { weekday: 'short', day: 'numeric' }),
          minutes: v?.total ?? 0,
          webMinutes: v?.web ?? 0,
          iosMinutes: v?.ios ?? 0,
        })
      }

      return {
        activeToday: activeTodaySet.size,
        periodSessions,
        periodMinutes,
        webShare: periodMinutes > 0 ? Math.round((periodWebMinutes / periodMinutes) * 100) : 100,
        byUser: [...users.values()].sort((a, b) => b.minutes - a.minutes),
        byDay,
        topScreens,
        topActions,
      }
    },
  })
}
