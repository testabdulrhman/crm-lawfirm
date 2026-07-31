import { useEffect, useState, type ReactNode } from 'react'

import { cn } from '@/lib/utils'
import { usePrefs } from '@/stores/prefs'
import { useAuth } from '@/stores/auth'
import { startUsageTracking } from '@/lib/usageTracker'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { AiAssistant } from '@/components/AiAssistant'

export function AppLayout({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { teamMember } = useAuth()

  // تسجيل جلسة الاستخدام (مرة واحدة لكل فتح للتطبيق)
  useEffect(() => {
    if (teamMember?.name) {
      void startUsageTracking(teamMember.name, teamMember.role)
    }
  }, [teamMember?.name, teamMember?.role])
  // مفتاح يعيد بناء المحتوى عند تغيير تفضيل عرض التاريخ (تحديث فوري للتواريخ)
  const dateDisplay = usePrefs((s) => s.dateDisplay)

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Sidebar ثابت على الحاسب (يمين بسبب RTL) */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {/* Drawer الجوال */}
      <div className={cn('md:hidden', mobileOpen ? '' : 'pointer-events-none')}>
        {/* overlay */}
        <div
          className={cn(
            'fixed inset-0 z-40 bg-black/50 transition-opacity duration-300',
            mobileOpen ? 'opacity-100' : 'opacity-0'
          )}
          onClick={() => setMobileOpen(false)}
        />
        {/* اللوحة المنزلقة من اليمين */}
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
        <main key={dateDisplay} className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>

      {/* المساعد الذكي — زر عائم متاح في كل الصفحات */}
      <AiAssistant />
    </div>
  )
}
