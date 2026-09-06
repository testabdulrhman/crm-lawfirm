import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'wouter'
import { Loader2, RefreshCw } from 'lucide-react'

import { cn } from '@/lib/utils'
import { usePrefs } from '@/stores/prefs'
import { useAuth } from '@/stores/auth'
import { startUsageTracking } from '@/lib/usageTracker'
import { registerPush, isNative } from '@/lib/push'
import { useSwipeBack, usePullToRefresh } from '@/hooks/useNativeGestures'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { MobileTabBar } from './MobileTabBar'
import { AiAssistant } from '@/components/AiAssistant'
import { useIsCollaborator } from '@/hooks/useIsCollaborator'

export function AppLayout({ children }: { children: ReactNode }) {
  const isCollaborator = useIsCollaborator()
  const [mobileOpen, setMobileOpen] = useState(false)
  const { teamMember } = useAuth()
  const [location, navigate] = useLocation()

  // داخل التطبيق: شريط تبويبات سفلي بدل الدرج، وإيماءات iOS
  const native = isNative()
  const scrollRef = useRef<HTMLElement>(null)
  useSwipeBack()
  const { pull, refreshing } = usePullToRefresh(scrollRef)

  // تسجيل جلسة الاستخدام (مرة واحدة لكل فتح للتطبيق)
  useEffect(() => {
    if (teamMember?.name) {
      void startUsageTracking(teamMember.name, teamMember.role)
    }
  }, [teamMember?.name, teamMember?.role])

  // الإشعارات الفورية على الآيفون: تسجيل جهاز الموظف، والضغط على الإشعار
  // يفتح غرفة المهمة مباشرة. على الويب لا شيء يحدث (no-op).
  useEffect(() => {
    if (!teamMember?.id) return
    void registerPush(teamMember.id, (route) => navigate(route))
  }, [teamMember?.id, navigate])

  // الانتقال بين الصفحات يعيد التمرير للأعلى — سلوك التطبيقات الأصيلة
  // (الويب يفعلها المتصفح، أما داخل حاوية تمرير واحدة فلا)
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [location])

  // مفتاح يعيد بناء المحتوى عند تغيير تفضيل عرض التاريخ (تحديث فوري للتواريخ)
  const dateDisplay = usePrefs((s) => s.dateDisplay)

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#EFEDE7] p-0 dark:bg-navy-900 md:p-3">
      {/* الإطار العائم: التطبيق كله داخل بطاقة واحدة على خلفية دافئة */}
      <div className="flex h-full w-full min-w-0 overflow-hidden bg-background md:rounded-[28px] md:shadow-[0_8px_40px_rgba(17,29,58,0.10)]">
      {/* Sidebar ثابت على الحاسب (يمين بسبب RTL) */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {/* Drawer الجوال — وداخل التطبيق يفتحه زر «المزيد» في الشريط السفلي */}
      <div className={cn('md:hidden', mobileOpen ? '' : 'pointer-events-none')}>
        <div
          className={cn(
            'fixed inset-0 z-40 bg-black/50 transition-opacity duration-300',
            mobileOpen ? 'opacity-100' : 'opacity-0'
          )}
          onClick={() => setMobileOpen(false)}
        />
        <div
          className={cn(
            'fixed inset-y-0 right-0 z-50 transition-transform duration-300 ease-in-out',
            mobileOpen ? 'translate-x-0' : 'translate-x-full'
          )}
        >
          <Sidebar onNavigate={() => setMobileOpen(false)} />
        </div>
      </div>

      {/* منطقة المحتوى */}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onOpenMenu={() => setMobileOpen(true)} />

        {/* مؤشّر السحب للتحديث — يظهر فوق المحتوى ويتبع الإصبع */}
        {native && (pull > 0 || refreshing) && (
          <div
            className="flex shrink-0 items-center justify-center overflow-hidden text-gold transition-[height] duration-150"
            style={{ height: refreshing ? 44 : pull }}
          >
            {refreshing ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <RefreshCw
                className="h-5 w-5"
                style={{ transform: `rotate(${pull * 3}deg)`, opacity: pull / 70 }}
              />
            )}
          </div>
        )}

        <main
          ref={scrollRef}
          key={dateDisplay}
          className={cn(
            'flex-1 overflow-y-auto p-4 md:p-6',
            // زخم تمرير iOS + منع سحب الصفحة كلها خلف المحتوى
            native && 'overscroll-contain [-webkit-overflow-scrolling:touch]'
          )}
        >
          {children}
        </main>

        {/* الشريط السفلي — داخل التطبيق فقط، والويب يبقى كما هو */}
        {native && <MobileTabBar onOpenMore={() => setMobileOpen(true)} />}
      </div>

      </div>

      {/* المساعد الذكي — زر عائم؛ يُخفى عن المتعاون لأنه مساعد على مستوى المكتب */}
      {!isCollaborator && <AiAssistant />}
    </div>
  )
}
