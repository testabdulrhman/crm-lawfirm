import { useMemo, useState } from 'react'
import { UserPlus, X, Users } from 'lucide-react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/stores/auth'
import { useIsDirector } from '@/hooks/useIsDirector'
import { useTeamMembers } from '@/hooks/useTeam'
import {
  useAddCaseMember,
  useCaseMembers,
  useRemoveCaseMember,
} from '@/hooks/useCaseMembers'
import { useConfirm } from '@/components/ConfirmDialog'
import type { Case } from '@/types/db'

/**
 * فريق الملف — من يعمل عليه غير مسؤوله.
 *
 * الإشراك يفتح الملف وتوابعه كلها (الجلسات والمستندات والمهام والنقاش) لمن
 * أُضيف، ويصله إشعار. أما الأتعاب والعقود فتبقى للمدير وحده كما هي.
 * ومن يملك الإضافة: المدير أو **مسؤول الملف نفسه** — تُطبّقها القاعدة، وهذه
 * الواجهة تخفي الزر فقط.
 */
export function CaseTeamCard({ caseData: c }: { caseData: Case }) {
  const { teamMember } = useAuth()
  const isDirector = useIsDirector()
  const { data: members } = useCaseMembers(c.id)
  const { data: allMembers } = useTeamMembers()
  const addM = useAddCaseMember(c.id)
  const removeM = useRemoveCaseMember(c.id)
  const { confirm, dialog } = useConfirm()
  const [picking, setPicking] = useState(false)

  const canManage = isDirector || c.assignee_id === teamMember?.id

  // المرشّحون: النشطون، عدا المسؤول ومن أُضيف سلفاً وأنا نفسي إن كنت المسؤول
  const candidates = useMemo(() => {
    const taken = new Set((members ?? []).map((m) => m.member_id))
    return (allMembers ?? []).filter(
      (m) => m.is_active && m.id !== c.assignee_id && !taken.has(m.id)
    )
  }, [allMembers, members, c.assignee_id])

  const remove = (memberId: string, name: string) =>
    confirm({
      title: 'إزالة من فريق الملف؟',
      description: `${name} لن يعود يرى هذا الملف ولا جلساته ولا مستنداته.`,
      confirmLabel: 'أزِل',
      destructive: true,
      onConfirm: () => removeM.mutate(memberId),
    })

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-gold" />
          <CardTitle className="text-base">فريق الملف</CardTitle>
        </div>
        {canManage && !picking && candidates.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setPicking(true)}
            className="gap-1 text-gold"
          >
            <UserPlus className="h-4 w-4" />
            إضافة
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
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

        {(members ?? []).length === 0 && !picking && (
          <p className="text-xs text-muted-foreground">
            لا أحد غير المسؤول. من يُضاف هنا يرى الملف وجلساته ومستنداته
            ومهامه — ولا يرى الأتعاب.
          </p>
        )}

        {(members ?? []).map((m) => (
          <div key={m.member_id} className="flex items-center gap-2">
            <Avatar className="h-8 w-8">
              {m.member?.avatar_url && (
                <AvatarImage src={m.member.avatar_url} alt={m.member.name} />
              )}
              <AvatarFallback className="bg-gold/20 text-xs text-navy dark:text-gold-200">
                {m.member?.avatar_initial || m.member?.name?.charAt(0) || '؟'}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {m.member?.short_name || m.member?.name || 'عضو'}
              </p>
              {m.role && (
                <p className="text-xs text-muted-foreground">{m.role}</p>
              )}
            </div>
            {canManage && (
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() =>
                  remove(m.member_id, m.member?.short_name || m.member?.name || 'العضو')
                }
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
      </CardContent>
      {dialog}
    </Card>
  )
}
