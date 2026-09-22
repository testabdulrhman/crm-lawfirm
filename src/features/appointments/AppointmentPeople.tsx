import { useMemo, useState } from 'react'
import { Loader2, UserPlus, Users, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { UserAvatar } from '@/components/UserAvatar'
import { useConfirm } from '@/components/ConfirmDialog'
import { useAuth } from '@/stores/auth'
import { useTeamMembers } from '@/hooks/useTeam'
import { useAssignAppointment } from '@/hooks/useAppointments'
import {
  useAddAppointmentMember,
  useAppointmentMembers,
  useRemoveAppointmentMember,
} from '@/hooks/useAppointmentMembers'
import type { Appointment, TeamMember } from '@/types/db'

// Radix لا يقبل قيمة فارغة لعنصر الاختيار
const NO_ASSIGNEE = '__none__'

/**
 * أشخاص الموعد — نفس طريقة المشاريع (طلب المدير 2026-09-22):
 * مسؤول واحد، ومعه من يُشرَك. كلاهما يصله إشعار يفتح المواعيد.
 *
 * الإسناد من هنا لا من نموذج التعديل: هو يحدث لحظة اتصال العميل.
 */
export function AppointmentPeople({ appointment: a }: { appointment: Appointment }) {
  const { teamMember } = useAuth()
  const { data: allMembers } = useTeamMembers()
  const { data: members } = useAppointmentMembers(a.id)
  const assignM = useAssignAppointment()
  const addM = useAddAppointmentMember(a.id)
  const removeM = useRemoveAppointmentMember(a.id)
  const { confirm, dialog } = useConfirm()
  const [picking, setPicking] = useState(false)

  const active = useMemo(
    () => (allMembers ?? []).filter((m) => m.is_active),
    [allMembers]
  )

  const candidates = useMemo(() => {
    const taken = new Set((members ?? []).map((m) => m.member_id))
    // يُستبعد المسؤول ومن أُشرك سلفاً — الإشراك مرة واحدة
    return active.filter((m) => m.id !== a.assignee_id && !taken.has(m.id))
  }, [active, members, a.assignee_id])

  const remove = (memberId: string, name: string) =>
    confirm({
      title: 'إزالة من الموعد؟',
      description: `${name} لن يعود ضمن من يحضر هذا الموعد.`,
      confirmLabel: 'أزِل',
      destructive: true,
      onConfirm: () => removeM.mutate(memberId),
    })

  return (
    <div className="space-y-3 border-t pt-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Users className="h-4 w-4 text-gold" />
          من يستقبل هذا الموعد
        </p>
        {!picking && candidates.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            className="gap-1 text-gold"
            onClick={() => setPicking(true)}
          >
            <UserPlus className="h-4 w-4" />
            إشراك زميل
          </Button>
        )}
      </div>

      {/* المسؤول */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">المسؤول</span>
        <Select
          value={a.assignee_id ?? NO_ASSIGNEE}
          disabled={assignM.isPending}
          onValueChange={(v) =>
            assignM.mutate({
              appointment: a,
              assigneeId: v === NO_ASSIGNEE ? null : v,
              assignedBy: teamMember?.name ?? null,
            })
          }
        >
          <SelectTrigger className="h-9 w-48">
            <SelectValue placeholder="بلا مسؤول" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_ASSIGNEE}>بلا مسؤول</SelectItem>
            {active.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.short_name || m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {assignM.isPending && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* المشاركون */}
      {picking && (
        <Select
          onValueChange={(id) => {
            addM.mutate({ memberId: id, addedBy: teamMember?.id ?? null })
            setPicking(false)
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="اختر زميلاً لإشراكه" />
          </SelectTrigger>
          <SelectContent>
            {candidates.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.short_name || m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {(members ?? []).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {(members ?? []).map((m) => (
            <span
              key={m.member_id}
              className="flex items-center gap-1.5 rounded-full border bg-muted/40 py-1 pe-1 ps-2.5 text-sm"
            >
              <UserAvatar
                member={m.member as unknown as TeamMember | null}
                className="h-6 w-6"
                fallbackClassName="text-[10px]"
              />
              <span className="text-foreground">
                {m.member?.short_name || m.member?.name || 'زميل'}
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                onClick={() =>
                  remove(m.member_id, m.member?.short_name || m.member?.name || 'الزميل')
                }
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </span>
          ))}
        </div>
      )}

      {!a.assignee_id && (members ?? []).length === 0 && !picking && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          لا أحد على هذا الموعد بعد — من يُسنَد إليه أو يُشرَك فيه يصله إشعار.
        </p>
      )}
      {dialog}
    </div>
  )
}
