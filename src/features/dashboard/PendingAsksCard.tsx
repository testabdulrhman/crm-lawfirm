// «ينتظرون ردك» — ما طلبه الزملاء منك في النقاشات ولم ترد عليه، بسطر يكتبه الذكاء من سياق الرسائل
// (طلب المدير 2026-10-29: «انسى ارد عليهم أو انسى وش يبون مني»). للمدير الآن؛ تجمعه دالة pending-asks كل ساعة.
import { useLocation } from 'wouter'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlarmClock, Check, ListPlus, Loader2, MessageCircleQuestion, MessagesSquare, RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import { errMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { localISO, todayISO } from '@/lib/format'
import { requestDiscussionJump } from '@/lib/discussionJump'
import { useAuth } from '@/stores/auth'
import { Panel } from './sections'

interface PendingAsk {
  id: string
  case_id: string | null
  ask: string | null
  urgency: 'high' | 'normal'
  ask_at: string
  asker: { name: string | null } | null
  case: { office_num: string | null; title: string | null; kind: string | null } | null
}

const KEY = ['pending_asks'] as const
const MATTER_KINDS = ['case', 'legal_service', 'property', 'bankruptcy']

function since(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'اليوم'
  if (days === 1) return 'أمس'
  if (days === 2) return 'منذ يومين'
  if (days <= 10) return `منذ ${days} أيام`
  return `منذ ${days} يوماً`
}

const firstName = (n: string | null | undefined) => (n ?? '').replace(/^(المستشار|المحامي|المحامية)\s*:?\s*/, '').trim().split(/\s+/)[0] || 'زميل'

export function PendingAsksCard() {
  const qc = useQueryClient()
  const [, navigate] = useLocation()
  const me = useAuth((s) => s.teamMember?.id)

  const { data, isLoading } = useQuery({
    queryKey: KEY,
    staleTime: 60_000,
    queryFn: async (): Promise<PendingAsk[]> => {
      const { data, error } = await supabase
        .from('pending_asks')
        .select('id, case_id, ask, urgency, ask_at, status, snooze_until, asker:team_members!pending_asks_asker_id_fkey(name), case:cases(office_num, title, kind)')
        .or(`status.eq.open,and(status.eq.snoozed,snooze_until.lte.${todayISO()})`)
        .order('urgency', { ascending: true }) // high قبل normal أبجدياً
        .order('ask_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as unknown as PendingAsk[]
    },
  })

  const setStatus = useMutation({
    mutationFn: async (v: { id: string; status: 'done' | 'snoozed' | 'tasked'; snooze_until?: string; task_id?: string }) => {
      const { error } = await supabase.from('pending_asks')
        .update({ status: v.status, snooze_until: v.snooze_until ?? null, task_id: v.task_id ?? null, updated_at: new Date().toISOString() })
        .eq('id', v.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    onError: (e) => toast({ variant: 'destructive', title: 'تعذّر التحديث', description: errMessage(e) }),
  })

  const toTask = useMutation({
    mutationFn: async (a: PendingAsk) => {
      const { data: t, error } = await supabase.from('tasks').insert({
        title: (a.ask ?? 'متابعة طلب زميل').slice(0, 200),
        status: 'todo', priority: a.urgency === 'high' ? 'high' : 'med',
        due_date: todayISO(), assignee_id: me, created_by: me,
        case_id: a.case?.kind && MATTER_KINDS.includes(a.case.kind) ? a.case_id : null,
      }).select('id').single()
      if (error) throw error
      await setStatus.mutateAsync({ id: a.id, status: 'tasked', task_id: t.id })
    },
    onSuccess: () => {
      toast({ variant: 'success', title: 'أُضيفت مهمة لك اليوم' })
      qc.invalidateQueries({ queryKey: ['action_queue'] })
    },
    onError: (e) => toast({ variant: 'destructive', title: 'تعذّر إنشاء المهمة', description: errMessage(e) }),
  })

  const refresh = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke('pending-asks', { body: {} })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    onError: (e) => toast({ variant: 'destructive', title: 'تعذّر التحديث', description: errMessage(e) }),
  })

  const items = data ?? []
  if (!isLoading && !items.length && !refresh.isPending) return null

  const tomorrow = localISO(new Date(Date.now() + 86_400_000))
  const open = (a: PendingAsk) => {
    requestDiscussionJump({ caseId: a.case_id, at: a.ask_at })
    navigate('/discussions')
  }

  return (
    <Panel icon={MessageCircleQuestion} title="ينتظرون ردك" count={items.length} hint="من النقاشات — يختفي الطلب حين ترد عليه">
      <div className="overflow-hidden rounded-2xl bg-card">
        {isLoading ? (
          <div className="flex items-center gap-2 px-4 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> يجمع ما طُلب منك…
          </div>
        ) : (
          items.map((a, i) => (
            <div key={a.id} className={cn('flex items-start gap-3 px-4 py-3', i > 0 && 'border-t border-border/60')}>
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold/15 text-sm font-semibold text-gold-700 dark:text-gold-300">
                {firstName(a.asker?.name).charAt(0)}
              </span>
              <button type="button" onClick={() => open(a)} className="min-w-0 flex-1 text-right">
                <p className="text-sm leading-6 text-foreground">
                  {a.urgency === 'high' && (
                    <span className="me-1.5 rounded bg-destructive/10 px-1.5 py-0.5 text-[11px] font-semibold text-destructive">عاجل</span>
                  )}
                  {a.ask ?? `${firstName(a.asker?.name)} ينتظر ردك`}
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MessagesSquare className="h-3 w-3" />
                  {a.case?.kind === 'dm' ? 'محادثة مباشرة' : a.case?.office_num ?? 'نقاش'}
                  <span>·</span>
                  <span className={cn(Date.now() - new Date(a.ask_at).getTime() > 3 * 86_400_000 && 'text-amber-700 dark:text-amber-300')}>{since(a.ask_at)}</span>
                </p>
              </button>
              <div className="flex shrink-0 items-center gap-0.5">
                <Button size="icon" variant="ghost" className="h-8 w-8" title="حوّلها مهمة لك اليوم"
                  disabled={toTask.isPending} onClick={() => toTask.mutate(a)}>
                  <ListPlus className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" title="ذكّرني غداً"
                  onClick={() => setStatus.mutate({ id: a.id, status: 'snoozed', snooze_until: tomorrow })}>
                  <AlarmClock className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-600" title="تم"
                  onClick={() => setStatus.mutate({ id: a.id, status: 'done' })}>
                  <Check className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))
        )}
        <div className="flex justify-end border-t border-border/60 px-2 py-1.5">
          <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs text-muted-foreground" disabled={refresh.isPending} onClick={() => refresh.mutate()}>
            <RefreshCw className={cn('h-3.5 w-3.5', refresh.isPending && 'animate-spin')} /> حدّث الآن
          </Button>
        </div>
      </div>
    </Panel>
  )
}
