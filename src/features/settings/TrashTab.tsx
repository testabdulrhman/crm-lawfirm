import { useMemo } from 'react'
import {
  ArchiveRestore,
  FileText,
  FolderOpen,
  ListChecks,
  Mail,
  MessagesSquare,
  ScrollText,
  Signature,
  Trash2,
  type LucideIcon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { QueryErrorState } from '@/components/QueryErrorState'
import { EmptyState } from '@/components/EmptyState'
import { fmtDatePref } from '@/lib/format'
import { useTrashItems, useRestoreItem, type TrashItem } from '@/hooks/useTrash'

// سلة الاسترجاع (نمط Clio Recovery Bin): كل محذوفات النظام الناعمة في
// مكان واحد، والاسترجاع بنقرة — بدل التدخل اليدوي في القاعدة.

const KIND_META: Record<string, { label: string; icon: LucideIcon }> = {
  case: { label: 'المشاريع', icon: FolderOpen },
  task: { label: 'المهام', icon: ListChecks },
  document: { label: 'المستندات', icon: FileText },
  comment: { label: 'رسائل النقاش', icon: MessagesSquare },
  task_comment: { label: 'تعليقات المهام', icon: MessagesSquare },
  poa: { label: 'الوكالات', icon: Signature },
  engagement: { label: 'العقود', icon: ScrollText },
  letter: { label: 'الخطابات الصادرة', icon: Mail },
}

export function TrashTab() {
  const { data, isLoading, error, refetch } = useTrashItems(true)
  const restore = useRestoreItem()

  const groups = useMemo(() => {
    const map = new Map<string, TrashItem[]>()
    for (const it of data ?? []) {
      const arr = map.get(it.item_kind) ?? []
      arr.push(it)
      map.set(it.item_kind, arr)
    }
    return map
  }, [data])

  if (error) return <QueryErrorState error={error} onRetry={() => refetch()} />
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-2xl" />
        ))}
      </div>
    )
  }
  if (!data?.length) {
    return (
      <EmptyState
        icon={Trash2}
        title="السلة فارغة"
        description="ما يُحذف من النظام يبقى هنا قابلاً للاسترجاع"
      />
    )
  }

  return (
    <div className="space-y-6">
      {Object.entries(KIND_META).map(([kind, meta]) => {
        const items = groups.get(kind)
        if (!items?.length) return null
        const Icon = meta.icon
        return (
          <section key={kind}>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Icon className="h-4 w-4 text-gold" />
              {meta.label}
              <span className="text-xs font-normal text-muted-foreground">
                ({items.length})
              </span>
            </h3>
            <div className="overflow-hidden rounded-2xl border border-border/70 bg-card">
              {items.map((it, i) => (
                <div
                  key={it.id}
                  className={
                    'flex items-center gap-3 px-4 py-3' +
                    (i > 0 ? ' border-t border-border/50' : '')
                  }
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {it.label ?? '—'}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {[
                        it.context,
                        it.deleted_at ? `حُذف ${fmtDatePref(it.deleted_at.slice(0, 10))}` : null,
                        it.deleted_by ? `بواسطة ${it.deleted_by}` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 gap-1.5"
                    disabled={restore.isPending}
                    onClick={() => restore.mutate({ kind: it.item_kind, id: it.id })}
                  >
                    <ArchiveRestore className="h-3.5 w-3.5" />
                    استرجاع
                  </Button>
                </div>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
