import { useEffect, useMemo, useState } from 'react'
import {
  Link2,
  Plus,
  Pencil,
  Trash2,
  ExternalLink,
  Loader2,
  CalendarCheck,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { openExternal } from '@/lib/external'
import { QueryErrorState } from '@/components/QueryErrorState'
import {
  useLookups,
  useCreateLookup,
  useUpdateLookup,
  useDeleteLookup,
} from '@/hooks/useSettings'
import type { LookupValue } from '@/types/db'

// روابط التكاملات تُخزَّن في lookup_values تحت هذا النوع (بلا جداول جديدة)
export const INTEGRATION_LINK_TYPE = 'integration_link'
// إعدادات التكاملات (مفتاح/قيمة) — يقرؤها الخادم أيضاً (calendar-sync)
export const INTEGRATION_CONFIG_TYPE = 'integration_config'

// إضافة https:// تلقائياً إن غاب البروتوكول
const normalizeUrl = (raw: string) => {
  const u = raw.trim()
  if (!u) return ''
  return /^https?:\/\//i.test(u) ? u : `https://${u}`
}

export function IntegrationsTab() {
  const { data, isLoading, isError, error, refetch } = useLookups()
  const createM = useCreateLookup()
  const updateM = useUpdateLookup()
  const deleteM = useDeleteLookup()
  // نسختان مستقلتان لإعدادات التقويم — كي لا يتشارك مفتاح التفعيل وحفظ
  // المعرّف وحوار الروابط علم pending واحداً
  const createCfgM = useCreateLookup()
  const updateCfgM = useUpdateLookup()
  const [savingKey, setSavingKey] = useState<string | null>(null)

  const links = useMemo(
    () => (data ?? []).filter((l) => l.type === INTEGRATION_LINK_TYPE),
    [data]
  )

  // إعدادات (مفتاح ← صف)
  const config = useMemo(() => {
    const map = new Map<string, LookupValue>()
    for (const l of data ?? [])
      if (l.type === INTEGRATION_CONFIG_TYPE) map.set(l.label, l)
    return map
  }, [data])

  const setConfig = (key: string, value: string) => {
    setSavingKey(key)
    const done = { onSettled: () => setSavingKey(null) }
    const existing = config.get(key)
    if (existing) {
      updateCfgM.mutate(
        {
          id: existing.id,
          input: { type: INTEGRATION_CONFIG_TYPE, label: key, value },
        },
        done
      )
    } else {
      createCfgM.mutate(
        {
          type: INTEGRATION_CONFIG_TYPE,
          label: key,
          value,
          sort_order: 0,
        },
        done
      )
    }
  }

  // إعدادات Google Calendar
  const gcalEnabled = (config.get('google_calendar_enabled')?.value ?? 'true') !== 'false'
  const gcalIdSaved = config.get('google_calendar_id')?.value ?? ''
  const [gcalId, setGcalId] = useState(gcalIdSaved)
  useEffect(() => setGcalId(gcalIdSaved), [gcalIdSaved])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<LookupValue | null>(null)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [toDelete, setToDelete] = useState<LookupValue | null>(null)

  const openNew = () => {
    setEditing(null)
    setName('')
    setUrl('')
    setDialogOpen(true)
  }
  const openEdit = (l: LookupValue) => {
    setEditing(l)
    setName(l.label)
    setUrl(l.value)
    setDialogOpen(true)
  }

  const pending = createM.isPending || updateM.isPending
  const save = () => {
    const label = name.trim()
    const value = normalizeUrl(url)
    if (!label || !value || pending) return
    if (editing) {
      updateM.mutate(
        { id: editing.id, input: { type: INTEGRATION_LINK_TYPE, label, value } },
        { onSuccess: () => setDialogOpen(false) }
      )
    } else {
      createM.mutate(
        {
          type: INTEGRATION_LINK_TYPE,
          label,
          value,
          sort_order: links.length + 1,
        },
        { onSuccess: () => setDialogOpen(false) }
      )
    }
  }

  return (
    <div className="space-y-4">
      {/* روابط التكاملات — قابلة للتحرير من الجميع */}
      <Card>
        <CardContent className="pt-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-foreground">روابط المنصات</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                المنصات التي يستخدمها المكتب (ناجز، معين، البوابة…) — يمكن
                للجميع الإضافة والتعديل.
              </p>
            </div>
            <Button variant="gold" size="sm" onClick={openNew}>
              <Plus className="h-4 w-4" />
              رابط جديد
            </Button>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : isError ? (
            <QueryErrorState
              title="تعذّر تحميل روابط المنصات"
              error={error}
              onRetry={() => refetch()}
            />
          ) : links.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-10 text-center">
              <Link2 className="mb-2 h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                لا روابط بعد — أضف أول رابط عبر «رابط جديد».
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/60 overflow-hidden rounded-xl border">
              {links.map((l) => (
                <div key={l.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold/10">
                    <Link2 className="h-4 w-4 text-gold" />
                  </span>
                  <button
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-lg text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => openExternal(l.value)}
                    title="فتح الرابط"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {l.label}
                      </span>
                      <span
                        dir="ltr"
                        className="block truncate text-right text-xs text-muted-foreground"
                      >
                        {l.value}
                      </span>
                    </span>
                    {/* دلالة بصرية فقط — الصف كله هو زر الفتح */}
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title="تعديل"
                    onClick={() => openEdit(l)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    title="حذف"
                    onClick={() => setToDelete(l)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* تكامل Google Calendar — قابل للتحرير (جاهزية SaaS) */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
                <CalendarCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="font-medium text-foreground">Google Calendar</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  عند إضافة جلسة أو موعد يُنشأ حدث في التقويم (الجلسات أزرق،
                  المواعيد أخضر، تذكير منبثق قبل ١٠ دقائق)، ويُحذف الحدث عند
                  الحذف.
                </p>
              </div>
            </div>
            <Switch
              checked={gcalEnabled}
              aria-label="تفعيل تكامل Google Calendar"
              onCheckedChange={(v) =>
                setConfig('google_calendar_enabled', v ? 'true' : 'false')
              }
            />
          </div>

          <div className="mt-4 border-t pt-4">
            <Label htmlFor="gcal_id">معرّف التقويم (Calendar ID)</Label>
            <div className="mt-1.5 flex gap-2">
              <Input
                id="gcal_id"
                dir="ltr"
                value={gcalId}
                onChange={(e) => setGcalId(e.target.value)}
                placeholder="مثال: office@group.calendar.google.com"
                disabled={!gcalEnabled}
              />
              <Button
                variant="outline"
                className="shrink-0"
                disabled={
                  !gcalEnabled ||
                  savingKey === 'google_calendar_id' ||
                  gcalId.trim() === gcalIdSaved
                }
                onClick={() => setConfig('google_calendar_id', gcalId.trim())}
              >
                {savingKey === 'google_calendar_id' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                حفظ
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              اتركه فارغاً لاستخدام تقويم المنصة الافتراضي. لتقويم خاص بالمكتب:
              أنشئ تقويماً في Google Calendar وشاركه مع حساب المنصة ثم الصق
              معرّفه هنا.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* نموذج إضافة/تعديل */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'تعديل الرابط' : 'رابط جديد'}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              save()
            }}
            className="space-y-3"
          >
            <div className="space-y-1.5">
              <Label htmlFor="ln_name">الاسم *</Label>
              <Input
                id="ln_name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: ناجز"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ln_url">الرابط *</Label>
              <Input
                id="ln_url"
                dir="ltr"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://najiz.moj.gov.sa"
              />
            </div>
            <DialogFooter className="gap-2 pt-2">
              <Button
                type="submit"
                variant="gold"
                disabled={pending || name.trim() === '' || url.trim() === ''}
              >
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                حفظ
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                إلغاء
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* تأكيد الحذف */}
      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الرابط</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف «{toDelete?.label}» نهائياً. هل أنت متأكد؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (toDelete) deleteM.mutate(toDelete.id)
                setToDelete(null)
              }}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
