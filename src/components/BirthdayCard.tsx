// بطاقة عيد الميلاد في لوحة التحكم — تظهر فقط يوم ميلاد أحد الفريق.
// هي وحدها ما يراه الفريق (2026-09-26: لا منشور في القناة ولا إشعار — «خله كأنه بنر»)،
// والتهنئة برسالة خاصة لصاحب اليوم.
// الخصوصية: تعرض اليوم والشهر فقط (لا سنة ولا عمر في أي نص).
import { useQuery } from '@tanstack/react-query'
import { useLocation } from 'wouter'
import { Cake, Loader2, MessageSquareHeart } from 'lucide-react'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import { Button } from '@/components/ui/button'
import { useOpenDm } from '@/hooks/useDiscussions'
import { requestDiscussionJump } from '@/lib/discussionJump'

interface BirthdayMember {
  id: string
  name: string | null
  short_name: string | null
  date_of_birth: string
}

function todayMMDD(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${mm}-${dd}`
}

export function BirthdayCard() {
  const { teamMember } = useAuth()
  const [, navigate] = useLocation()
  const openDm = useOpenDm()

  const { data } = useQuery({
    queryKey: ['birthdays_today'],
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<BirthdayMember[]> => {
      const { data, error } = await supabase
        .from('team_members')
        .select('id, name, short_name, date_of_birth')
        .eq('is_active', true)
        .not('date_of_birth', 'is', null)
      if (error) throw error
      return (data ?? []) as BirthdayMember[]
    },
  })

  const today = todayMMDD()
  const celebrants = (data ?? []).filter(
    (m) => m.date_of_birth?.slice(5, 10) === today
  )
  if (celebrants.length === 0) return null

  const isMine = celebrants.some((m) => m.id === teamMember?.id)
  const names = celebrants
    .map((m) => m.short_name || m.name || '')
    .filter(Boolean)
    .join(' و')

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gold/40 bg-gradient-to-l from-gold/15 via-gold/5 to-transparent px-5 py-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold/20 text-xl">
          🎂
        </span>
        <div>
          <p className="font-semibold text-foreground">
            {isMine
              ? `كل عام وأنتم بخير يا ${names}!`
              : `🎉 اليوم عيد ميلاد ${names}`}
          </p>
          <p className="text-sm text-muted-foreground">
            {isMine
              ? 'فريق المكتب يحتفي بكم اليوم — يوم سعيد!'
              : 'كل عام وكل خير — هنّئه برسالة خاصة.'}
          </p>
        </div>
      </div>
      {!isMine && (
        <div className="flex flex-wrap gap-2">
          {celebrants.map((m) => (
            <Button
              key={m.id}
              size="sm"
              variant="gold"
              disabled={openDm.isPending}
              onClick={() =>
                openDm.mutate(m.id, {
                  onSuccess: (id) => {
                    requestDiscussionJump({ caseId: id })
                    navigate('/discussions')
                  },
                })
              }
            >
              {openDm.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquareHeart className="h-4 w-4" />}
              {celebrants.length > 1 ? `هنّئ ${m.short_name || m.name}` : 'هنّئه'}
            </Button>
          ))}
        </div>
      )}
      {isMine && <Cake className="h-6 w-6 text-gold" />}
    </div>
  )
}
