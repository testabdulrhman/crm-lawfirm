import { useMemo, useState } from 'react'
import { Link } from 'wouter'
import { ExternalLink, Phone, UserPlus, Users, X } from 'lucide-react'

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
import { useConfirm } from '@/components/ConfirmDialog'
import { useAuth } from '@/stores/auth'
import { useIsDirector } from '@/hooks/useIsDirector'
import { useTeamMembers } from '@/hooks/useTeam'
import {
  useAddCaseMember,
  useCaseMembers,
  useRemoveCaseMember,
} from '@/hooks/useCaseMembers'
import { openExternal } from '@/lib/external'
import type { Case } from '@/types/db'

/**
 * أشخاص الملف في بطاقة واحدة: الموكّل · المحامي المسؤول · الفريق.
 *
 * كانت ثلاث بطاقات متجاورة تسأل عن سؤال واحد («من على هذا الملف؟») فتشتّت
 * العين — دُمجت بطلب المستخدم (2026-09-07).
 *
 * الإشراك يفتح الملف وتوابعه كلها لمن أُضيف ويصله إشعار، والأتعاب تبقى
 * للمدير. ومن يملك الإضافة: المدير أو مسؤول الملف — تُطبّقه القاعدة،
 * وهذه الواجهة تخفي الزر فقط.
 */
export function CasePeopleCard({ caseData: c }: { caseData: Case }) {
  const { teamMember } = useAuth()
  const isDirector = useIsDirector()
  const { data: members } = useCaseMembers(c.id)
  const { data: allMembers } = useTeamMembers()
  const addM = useAddCaseMember(c.id)
  const removeM = useRemoveCaseMember(c.id)
  const { confirm, dialog } = useConfirm()
  const [picking, setPicking] = useState(false)

  const canManage = isDirector || c.assignee_id === teamMember?.id

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
          <CardTitle className="text-base">الأشخاص</CardTitle>
        </div>
        {canManage && !picking && candidates.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setPicking(true)}
            className="gap-1 text-gold"
          >
            <UserPlus className="h-4 w-4" />
            إشراك زميل
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* ===== الموكّل ===== */}
        {c.contact && (
          <Section label="الموكّل">
            <div className="flex items-center gap-2">
              <PersonAvatar name={c.contact.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {c.contact.name}
                </p>
                <div className="flex items-center gap-3">
                  {c.contact.phone && (
                    <button
                      dir="ltr"
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-gold"
                      onClick={() => openExternal(`tel:${c.contact!.phone}`)}
                    >
                      <span>{c.contact.phone}</span>
                      <Phone className="h-3 w-3" />
                    </button>
                  )}
                  <Link
                    href={`/contacts/${c.contact.id}`}
                    className="inline-flex items-center gap-1 text-xs text-gold hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    ملفه
                  </Link>
                </div>
              </div>
            </div>
          </Section>
        )}

        {/* ===== المحامي المسؤول ===== */}
        <Section label="المحامي المسؤول">
          {c.assignee ? (
            <div className="flex items-center gap-2">
              <PersonAvatar name={c.assignee.name} />
              <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                {c.assignee.short_name || c.assignee.name}
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">بلا مسؤول</p>
          )}
        </Section>

        {/* ===== الفريق ===== */}
        <Section label="الفريق">
          {picking && (
            <Select
              onValueChange={(id) => {
                addM.mutate({ memberId: id, addedBy: teamMember?.id ?? null })
                setPicking(false)
              }}
            >
              <SelectTrigger className="mb-2">
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

          {(members ?? []).length === 0 && !picking ? (
            <p className="text-xs text-muted-foreground">
              لا أحد غير المسؤول. من يُضاف هنا يرى الملف وجلساته ومستنداته
              ومهامه — ولا يرى الأتعاب.
            </p>
          ) : (
            <div className="space-y-2">
              {(members ?? []).map((m) => (
                <div key={m.member_id} className="flex items-center gap-2">
                  <PersonAvatar
                    name={m.member?.name ?? 'عضو'}
                    initial={m.member?.avatar_initial ?? null}
                    url={m.member?.avatar_url ?? null}
                  />
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
                        remove(
                          m.member_id,
                          m.member?.short_name || m.member?.name || 'العضو'
                        )
                      }
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>
      </CardContent>
      {dialog}
    </Card>
  )
}

/** قسم داخل البطاقة — عنوان صغير وخطّ فاصل يفصل الأدوار بلا بطاقات متعددة */
function Section({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="border-b border-border/50 pb-3 last:border-0 last:pb-0">
      <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  )
}

function PersonAvatar({
  name,
  initial,
  url,
}: {
  name: string | null
  initial?: string | null
  url?: string | null
}) {
  return (
    <Avatar className="h-8 w-8">
      {url && <AvatarImage src={url} alt={name ?? ''} />}
      <AvatarFallback className="bg-gold/20 text-xs text-navy dark:text-gold-200">
        {initial || name?.charAt(0) || '؟'}
      </AvatarFallback>
    </Avatar>
  )
}
