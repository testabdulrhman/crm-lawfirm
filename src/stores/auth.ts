import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { User, Session } from '@supabase/supabase-js'
import type { TeamMember } from '@/types/db'

interface AuthState {
  user: User | null
  session: Session | null
  teamMember: TeamMember | null
  loading: boolean
  initialize: () => Promise<void>
  login: (
    email: string,
    password: string
  ) => Promise<{ ok: boolean; error?: string }>
  loginWithSession: (
    accessToken: string,
    refreshToken: string
  ) => Promise<{ ok: boolean; error?: string }>
  logout: () => Promise<void>
  // يجلب سجلّ الموظف؛ يُرجع false إن كان الحساب موقوفاً (ويُنهي الجلسة)
  fetchTeamMember: (userId: string) => Promise<boolean>
}

/**
 * ذاكرة البيانات (React Query) تُمسح كلما تبدّل صاحب الجلسة أو خرج — فحص 2026-10-19: كان الخروج لا يمسحها
 * ومفاتيحها بلا معرّف المستخدم، فيرى الداخل بعده في التبويب نفسه ملفات السابق ومهامه حتى يُعاد الجلب.
 * (استيراد متأخر: queryClient ← errorLog ← هذا الملف)
 */
let cacheOwner: string | null = null
function resetCacheFor(userId: string | null) {
  if (userId === cacheOwner) return
  const hadOwner = cacheOwner !== null
  cacheOwner = userId
  if (!hadOwner) return // أول جلسة في الصفحة: الذاكرة فارغة أصلاً
  void import('@/lib/queryClient').then(({ queryClient }) => {
    void queryClient.cancelQueries()
    queryClient.clear()
  })
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  teamMember: null,
  loading: true,
  initialize: async () => {
    set({ loading: true })
    const { data } = await supabase.auth.getSession()
    if (data.session) {
      resetCacheFor(data.session.user.id)
      set({ session: data.session, user: data.session.user })
      await get().fetchTeamMember(data.session.user.id)
    }
    supabase.auth.onAuthStateChange(async (_e, session) => {
      resetCacheFor(session?.user?.id ?? null)
      set({ session, user: session?.user ?? null })
      if (session?.user) await get().fetchTeamMember(session.user.id)
      else set({ teamMember: null })
    })
    set({ loading: false })
  },
  login: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) return { ok: false, error: error.message }
    set({ session: data.session, user: data.user })
    const active = await get().fetchTeamMember(data.user.id)
    if (!active) return { ok: false, error: 'account_disabled' }
    return { ok: true }
  },
  // إرساء جلسة قادمة من دخول OTP (الرموز من Edge Function)
  loginWithSession: async (accessToken, refreshToken) => {
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    })
    if (error || !data.session) return { ok: false, error: error?.message }
    set({ session: data.session, user: data.session.user })
    const active = await get().fetchTeamMember(data.session.user.id)
    if (!active) return { ok: false, error: 'account_disabled' }
    return { ok: true }
  },
  logout: async () => {
    await supabase.auth.signOut()
    resetCacheFor(null)
    set({ user: null, session: null, teamMember: null })
  },
  fetchTeamMember: async (userId) => {
    // الربط عبر العمود auth_id في جدول team_members
    const { data } = await supabase
      .from('team_members')
      .select('*')
      .eq('auth_id', userId)
      .maybeSingle()
    const member = data as TeamMember | null
    // الموظف الموقوف (is_active=false) لا يدخل — إنهاء الجلسة فوراً
    if (member && member.is_active === false) {
      await supabase.auth.signOut()
      resetCacheFor(null)
      set({ user: null, session: null, teamMember: null })
      return false
    }
    if (member) set({ teamMember: member })
    return true
  },
}))
