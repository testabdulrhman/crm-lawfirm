import { useEffect, useState } from 'react'
import { Loader2, UserPlus } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import { errMessage } from '@/lib/errors'
import { normalizeSaudiPhone } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Contact } from '@/types/db'

/**
 * إنشاء جهة اتصال دون مغادرة النموذج.
 *
 * الغرض: ألّا تصطدم بجدار «لا نتائج» وأنت في منتصف فتح قضية أو حجز موعد،
 * فتضطر لترك ما تكتب والذهاب إلى صفحة جهات الاتصال ثم العودة.
 *
 * الحد الأدنى فقط — اسم وجوال ونوع الكيان. البقية تُستكمل لاحقاً من ملف
 * جهة الاتصال، تماماً كما يفعل زر «+ New contact» في كليو.
 */
export function QuickContactDialog({
  open,
  onOpenChange,
  initialName = '',
  category = 'client',
  onCreated,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** ما كتبه المستخدم في البحث — يُملأ مسبقاً في حقل الاسم */
  initialName?: string
  /** تصنيف الجهة الجديدة: 'client' لموكّل، 'caller' لمتصل */
  category?: string
  onCreated: (c: Contact) => void
}) {
  const [name, setName] = useState(initialName)
  const [phone, setPhone] = useState('')
  const [entityType, setEntityType] = useState<'فرد' | 'منشأة'>('فرد')
  const [busy, setBusy] = useState(false)
  const qc = useQueryClient()

  // إعادة الضبط عند كل فتح — لا نُبقي بقايا محاولة سابقة
  useEffect(() => {
    if (open) {
      setName(initialName)
      setPhone('')
      setEntityType('فرد')
    }
  }, [open, initialName])

  const submit = async () => {
    const cleanName = name.trim()
    if (!cleanName) {
      toast({ variant: 'destructive', title: 'اكتب الاسم أولاً' })
      return
    }
    const cleanPhone = phone.trim() ? normalizeSaudiPhone(phone) : null

    setBusy(true)
    try {
      // إدراج مباشر لا عبر useCreateContact: فذلك الخطّاف يُطلق إشعار خطأ
      // عاماً («تعذّرت إضافة جهة الاتصال») قبل أن نصل إلى معالجة التكرار
      // أدناه، فيرى المستخدم رسالتين متناقضتين.
      const { data, error } = await supabase
        .from('contacts')
        .insert({
          name: cleanName,
          category,
          type: category,
          entity_type: entityType,
          phone: cleanPhone,
          source: 'manual',
        })
        .select()
        .single()
      if (error) throw error

      qc.invalidateQueries({ queryKey: ['contacts'] })
      qc.invalidateQueries({ queryKey: ['contact_work_links'] })
      toast({ variant: 'success', title: 'تمت إضافة جهة الاتصال' })
      onCreated(data as Contact)
      onOpenChange(false)
    } catch (e) {
      // الجوال عليه فهرس فريد (idx_contacts_phone_unique). بدل رسالة خطأ
      // غامضة، نجلب صاحب الرقم ونعرضه — فالمقصود غالباً هو نفسه.
      const code = (e as { code?: string })?.code
      if (code === '23505' && cleanPhone) {
        const { data } = await supabase
          .from('contacts')
          .select('*')
          .eq('phone', cleanPhone)
          .maybeSingle()
        if (data) {
          toast({
            title: 'هذا الجوال مسجّل مسبقاً',
            description: `اخترنا «${(data as Contact).name}» بدل إنشاء جهة مكرّرة.`,
          })
          onCreated(data as Contact)
          onOpenChange(false)
          return
        }
        toast({
          variant: 'destructive',
          title: 'هذا الجوال مسجّل لجهة اتصال أخرى',
          description: 'ابحث عنه بالرقم، أو أدخِل رقماً مختلفاً.',
        })
      } else {
        toast({
          variant: 'destructive',
          title: 'تعذّرت إضافة جهة الاتصال',
          description: errMessage(e),
        })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-gold" />
            جهة اتصال جديدة
          </DialogTitle>
          <DialogDescription>
            الحد الأدنى الآن — أكمل بقية البيانات لاحقاً من ملف جهة الاتصال.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="qc-name">
              الاسم <span className="text-destructive">*</span>
            </Label>
            <Input
              id="qc-name"
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              placeholder="الاسم الكامل"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void submit()
                }
              }}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="qc-phone">الجوال</Label>
            <Input
              id="qc-phone"
              dir="ltr"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="05xxxxxxxx"
              className="text-right"
            />
          </div>

          <div className="space-y-1.5">
            <Label>النوع</Label>
            <div className="inline-flex rounded-lg bg-muted p-1 text-sm">
              {(['فرد', 'منشأة'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setEntityType(t)}
                  className={cn(
                    'rounded-md px-4 py-1.5 transition-colors',
                    entityType === t
                      ? 'bg-card font-semibold text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            إلغاء
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            إضافة واختيار
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
