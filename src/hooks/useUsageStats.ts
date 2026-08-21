// إحصاءات استخدام التطبيق من usage_sessions (آخر 30 يوماً) — تجميع في المتصفح
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
  weekSessions: number
  weekMinutes: number
  webShare: number // نسبة دقائق الويب هذا الأسبوع ٪
  byUser: UserUsage[]
  byDay: DayUsage[] // آخر 14 يوماً
  topScreens: TopItem[] // بالدقائق — آخر 14 يوماً
  topActions: TopItem[] // بالنقرات
}

export function useUsageStats() {
  return useQuery({
    queryKey: ['usage-stats'],
    queryFn: async (): Promise<UsageStats> => {
      const since = new Date(Date.now() - 30 * 86400000).toISOString()
      const since14 = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10)
      const [sess, daily] = await Promise.all([
        supabase
          .from('usage_sessions')
          .select('user_name, user_role, login_at, minutes, updated_at, platform')
          .gte('login_at', since)
          .order('login_at', { ascending: false })
          .limit(3000),
        supabase
          .from('usage_daily')
          .select('event_type, page, label, hits, seconds')
          .gte('day', since14)
          .limit(5000),
      ])
      if (sess.error) throw sess.error
      const rows = (sess.data ?? []) as (UsageSessionRow & { platform?: string })[]
      const dailyRows = (daily.data ?? []) as {
        event_type: string
        page: string | null
        label: string | null
        hits: number | null
        seconds: number | null
      }[]

      const todayStr = new Date().toISOString().slice(0, 10)
      const weekAgo = Date.now() - 7 * 86400000

      const activeTodaySet = new Set<string>()
      let weekSessions = 0
      let weekMinutes = 0
      let weekWebMinutes = 0
      const users = new Map<string, UserUsage>()
      const days = new Map<string, { total: number; web: number; ios: number }>()

      for (const r of rows) {
        const mins = r.minutes ?? 0
        const day = r.login_at.slice(0, 10)
        if (day === todayStr) activeTodaySet.add(r.user_name)
        if (new Date(r.login_at).getTime() >= weekAgo) {
          weekSessions++
          weekMinutes += mins
          if ((r.platform ?? 'web') === 'web') weekWebMinutes += mins
        }
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
        const d = days.get(day) ?? { total: 0, web: 0, ios: 0 }
        d.total += mins
        if ((r.platform ?? 'web') === 'ios') d.ios += mins
        else d.web += mins
        days.set(day, d)
      }

      // أكثر الشاشات (بالثواني) وأكثر الأفعال (بالنقرات) — آخر ١٤ يوماً
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

      // آخر 14 يوماً متتالية (حتى الأيام بلا استخدام تظهر صفراً)
      const byDay: DayUsage[] = []
      for (let i = 13; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000)
        const key = d.toISOString().slice(0, 10)
        const v = days.get(key)
        byDay.push({
          day: key,
          label: d.toLocaleDateString('ar', { weekday: 'short', day: 'numeric' }),
          minutes: v?.total ?? 0,
          webMinutes: v?.web ?? 0,
          iosMinutes: v?.ios ?? 0,
        })
      }

      return {
        activeToday: activeTodaySet.size,
        weekSessions,
        weekMinutes,
        webShare: weekMinutes > 0 ? Math.round((weekWebMinutes / weekMinutes) * 100) : 100,
        byUser: [...users.values()].sort((a, b) => b.minutes - a.minutes),
        byDay,
        topScreens,
        topActions,
      }
    },
  })
}
