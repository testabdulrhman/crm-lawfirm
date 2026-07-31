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
}

export interface UsageStats {
  activeToday: number
  weekSessions: number
  weekMinutes: number
  byUser: UserUsage[]
  byDay: DayUsage[] // آخر 14 يوماً
}

export function useUsageStats() {
  return useQuery({
    queryKey: ['usage-stats'],
    queryFn: async (): Promise<UsageStats> => {
      const since = new Date(Date.now() - 30 * 86400000).toISOString()
      const { data, error } = await supabase
        .from('usage_sessions')
        .select('user_name, user_role, login_at, minutes, updated_at')
        .gte('login_at', since)
        .order('login_at', { ascending: false })
        .limit(3000)
      if (error) throw error
      const rows = (data ?? []) as UsageSessionRow[]

      const todayStr = new Date().toISOString().slice(0, 10)
      const weekAgo = Date.now() - 7 * 86400000

      const activeTodaySet = new Set<string>()
      let weekSessions = 0
      let weekMinutes = 0
      const users = new Map<string, UserUsage>()
      const days = new Map<string, number>()

      for (const r of rows) {
        const mins = r.minutes ?? 0
        const day = r.login_at.slice(0, 10)
        if (day === todayStr) activeTodaySet.add(r.user_name)
        if (new Date(r.login_at).getTime() >= weekAgo) {
          weekSessions++
          weekMinutes += mins
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
        days.set(day, (days.get(day) ?? 0) + mins)
      }

      // آخر 14 يوماً متتالية (حتى الأيام بلا استخدام تظهر صفراً)
      const byDay: DayUsage[] = []
      for (let i = 13; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000)
        const key = d.toISOString().slice(0, 10)
        byDay.push({
          day: key,
          label: d.toLocaleDateString('ar', { weekday: 'short', day: 'numeric' }),
          minutes: days.get(key) ?? 0,
        })
      }

      return {
        activeToday: activeTodaySet.size,
        weekSessions,
        weekMinutes,
        byUser: [...users.values()].sort((a, b) => b.minutes - a.minutes),
        byDay,
      }
    },
  })
}
