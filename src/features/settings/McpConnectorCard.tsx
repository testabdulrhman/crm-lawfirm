import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Copy, KeyRound, Loader2, Plug, RefreshCw, ShieldOff } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import { errMessage } from '@/lib/errors'
import { fmtDatePref } from '@/lib/format'
import type { LookupValue } from '@/types/db'

// موصّل MCP (طلب المدير 2026-10-22): يربط Claude وChatGPT بالنظام بصلاحيات المدير — قراءة وإجراءات بسيطة.
// الرابط يحمل رمزاً سرياً يُولَّد هنا ويُعرض مرة واحدة؛ القاعدة تحفظ بصمته (SHA-256) فقط في
// lookup_values mcp_config/token_hash، وهو نوع *config* لا يقرؤه إلا المدير. الدالة: supabase/functions/mcp.
const MCP_TYPE = 'mcp_config'
const MCP_LABEL = 'token_hash'
const FN_URL = `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/mcp`

const hex = (b: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')

const copy = (text: string) =>
  void navigator.clipboard.writeText(text).then(
    () => toast({ title: 'نُسخ الرابط' }),
    () => toast({ variant: 'destructive', title: 'تعذّر النسخ — انسخه يدوياً' })
  )

export function McpConnectorCard({ lookups }: { lookups: LookupValue[] }) {
  const qc = useQueryClient()
  const row = useMemo(
    () => lookups.find((l) => l.type === MCP_TYPE && l.label === MCP_LABEL) ?? null,
    [lookups]
  )
  const [busy, setBusy] = useState(false)
  const [freshUrl, setFreshUrl] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<'rotate' | 'revoke' | null>(null)

  const refresh = () => qc.invalidateQueries({ queryKey: ['lookup_values'] })

  // رمز جديد: يحلّ محل القديم فيتوقف كل رابط سابق فوراً
  const generate = async () => {
    setBusy(true)
    try {
      const token = hex(crypto.getRandomValues(new Uint8Array(32)))
      const hash = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))
      if (row) {
        const { error } = await supabase.from('lookup_values').delete().eq('id', row.id)
        if (error) throw error
      }
      const { error } = await supabase
        .from('lookup_values')
        .insert({ type: MCP_TYPE, label: MCP_LABEL, value: hash, sort_order: 0 })
      if (error) throw error
      setFreshUrl(`${FN_URL}/${token}`)
      await refresh()
    } catch (e) {
      toast({ variant: 'destructive', title: 'تعذّر إنشاء الرابط', description: errMessage(e) })
    } finally {
      setBusy(false)
    }
  }

  const revoke = async () => {
    if (!row) return
    setBusy(true)
    const { error } = await supabase.from('lookup_values').delete().eq('id', row.id)
    setBusy(false)
    if (error) {
      toast({ variant: 'destructive', title: 'تعذّر الإلغاء', description: errMessage(error) })
      return
    }
    toast({ variant: 'success', title: 'أُلغي الموصّل — توقّف الرابط في كل التطبيقات' })
    await refresh()
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gold/10">
              <Plug className="h-5 w-5 text-gold" />
            </div>
            <div>
              <p className="font-medium text-foreground">موصّل MCP</p>
              <p className="mt-1 text-sm text-muted-foreground">
                اسأل Claude أو ChatGPT عن ملفات المكتب وجلساته ومهامه ومستنداته
                ونقاشاته، واطلب منه إنشاء مهمة أو كتابة رسالة في نقاش ملف. يعمل
                بصلاحياتك أنت، ولا يحذف شيئاً ولا يراسل العملاء.
              </p>
            </div>
          </div>
          <span
            className={
              row
                ? 'shrink-0 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400'
                : 'shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground'
            }
          >
            {row ? 'مفعّل' : 'غير مفعّل'}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
          {row ? (
            <>
              <p className="w-full text-xs text-muted-foreground">
                أُنشئ الرابط الحالي في {fmtDatePref(row.created_at)} — لا يُعرض
                مرة أخرى؛ إن أضعته فأنشئ رابطاً جديداً.
              </p>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => setConfirm('rotate')}>
                <RefreshCw className="h-4 w-4" />
                رابط جديد
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive"
                disabled={busy}
                onClick={() => setConfirm('revoke')}
              >
                <ShieldOff className="h-4 w-4" />
                إلغاء الموصّل
              </Button>
            </>
          ) : (
            <Button variant="gold" size="sm" disabled={busy} onClick={generate}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              إنشاء رابط الموصّل
            </Button>
          )}
        </div>
      </CardContent>

      {/* الرابط يُعرض مرة واحدة */}
      <Dialog open={!!freshUrl} onOpenChange={(o) => !o && setFreshUrl(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>رابط الموصّل</DialogTitle>
            <DialogDescription>
              انسخه الآن — لا يُعرض مرة أخرى. من يملك هذا الرابط يقرأ بيانات
              المكتب بصلاحياتك، فلا تشاركه مع أحد.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2">
            <code
              dir="ltr"
              className="min-w-0 flex-1 select-all break-all rounded-lg border bg-muted/50 px-3 py-2 text-left text-xs"
            >
              {freshUrl}
            </code>
            <Button variant="gold" size="sm" className="shrink-0" onClick={() => freshUrl && copy(freshUrl)}>
              <Copy className="h-4 w-4" />
              نسخ
            </Button>
          </div>

          <div className="space-y-3 text-sm">
            <div className="rounded-lg border p-3">
              <p className="font-medium text-foreground">في Claude</p>
              <p className="mt-1 text-muted-foreground">
                الإعدادات ← الموصّلات (Connectors) ← «إضافة موصّل مخصّص» (Add
                custom connector) ← اكتب اسماً مثل «نظام المكتب» والصق الرابط.
                ثم فعّله من زر الأدوات تحت مربع الكتابة.
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="font-medium text-foreground">في ChatGPT</p>
              <p className="mt-1 text-muted-foreground">
                الإعدادات ← التطبيقات والموصّلات (Apps &amp; Connectors) ←
                الإعدادات المتقدّمة ← فعّل «وضع المطوّر» (Developer mode) ←
                «إنشاء» (Create) ← الصق الرابط، واختر المصادقة «بلا مصادقة» (No
                authentication).
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFreshUrl(null)}>
              تم
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === 'revoke' ? 'إلغاء الموصّل' : 'إنشاء رابط جديد'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === 'revoke'
                ? 'يتوقف الرابط الحالي فوراً في Claude وChatGPT، ولا يصل أي منهما للنظام حتى تنشئ رابطاً جديداً.'
                : 'يتوقف الرابط الحالي فوراً، وعليك لصق الرابط الجديد في Claude وChatGPT من جديد.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>رجوع</AlertDialogCancel>
            <AlertDialogAction
              className={
                confirm === 'revoke'
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  : undefined
              }
              onClick={() => {
                const c = confirm
                setConfirm(null)
                void (c === 'revoke' ? revoke() : generate())
              }}
            >
              {confirm === 'revoke' ? 'إلغاء الموصّل' : 'إنشاء'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
