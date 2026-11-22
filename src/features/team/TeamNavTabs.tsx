// تبويبا التنقل بين «الموظفون» و«طلبات التوظيف» — التوظيف جزء من إدارة الموظفين
import { useLocation } from 'wouter'
import { Users, UserPlus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { fmtNumber } from '@/lib/format'
import { usePendingApplicationsCount } from '@/hooks/useStaffApplications'
import { useCanViewOffice } from '@/hooks/useIsDirector'

export function TeamNavTabs({ active }: { active: 'team' | 'applications' }) {
  const [, navigate] = useLocation()
  const { data: pending } = usePendingApplicationsCount()
  // طلبات التوظيف للمدير وراكان وحدهما (قرار المدير 2026-11-22) — والقاعدة تحجبها عن غيرهما
  const canSeeApplicants = useCanViewOffice()
  if (!canSeeApplicants) return null

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        variant={active === 'team' ? 'default' : 'outline'}
        onClick={() => navigate('/team')}
      >
        <Users className="h-4 w-4" />
        الموظفون
      </Button>
      <Button
        size="sm"
        variant={active === 'applications' ? 'default' : 'outline'}
        onClick={() => navigate('/staff-applications')}
      >
        <UserPlus className="h-4 w-4" />
        طلبات التوظيف
        {(pending ?? 0) > 0 && (
          <span
            className={cn(
              'rounded-full px-1.5 text-xs font-bold',
              active === 'applications'
                ? 'bg-white/20'
                : 'bg-gold text-navy'
            )}
          >
            {fmtNumber(pending ?? 0)}
          </span>
        )}
      </Button>
    </div>
  )
}
