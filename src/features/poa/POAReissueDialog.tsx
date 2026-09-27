// طلب إعادة إصدار الوكالة من الموكّل عبر واتساب (طلب المدير 2026-09-27).
// القالب crm_law_07 أنشأه الـHub (المتغيّرات: اسم الموكّل · رقم الوكالة · تاريخ الانتهاء) —
// يصل خارج نافذة الـ٢٤ ساعة. والوكالة لا تُجدَّد بل يُعاد إصدارها (اصطلاح النظام).
//
// المستلم: أغلب الوكالات بلا client_id (اسم نصي فقط)، فيُستنتج بالترتيب: جهة الوكالة ← موكّل
// ملفها ← تطابق وحيد للاسم في جهات الاتصال؛ وإلا يختاره الموظف، ويُحفظ الربط على الوكالة.
import { useEffect, useMemo, useState } from 'react'
import { Loader2, MessageCircle, Send } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { ContactPicker } from '@/components/ContactPicker'
import { useContacts } from '@/hooks/useContacts'
import { supabase } from '@/lib/supabase'
import { arNorm } from '@/lib/arabic'
import { errMessage } from '@/lib/errors'
import { fmtDateTime, fmtHijri } from '@/lib/format'
import { toast } from '@/hooks/use-toast'
import { useAuth } from '@/stores/auth'
import type { Contact, PowerOfAttorney } from '@/types/db'

export const POA_REISSUE_TEMPLATE = 'crm_law_07'

/** نص القالب كما اعتُمد — للمعاينة فقط؛ الإرسال بالاسم والمتغيّرات */
function previewText(name: string, poaNumber: string, expiry: string): string {
  return (
    `السيد/ السادة ${name} سلّمهم الله\n` +
    `السلام عليكم ورحمة الله وبركاته، وبعد:\n` +
    `نفيدكم بأن الوكالة رقم (${poaNumber}) الصادرة لصالح شركتنا تاريخ انتهائها ${expiry}، ` +
    `ونأمل التكرم بإعادة إصدارها لضمان استمرار متابعة أعمالكم دون انقطاع.\n` +
    `شركة عبدالرحمن بن رضوان المشيقح للمحاماة وإدارة إجراءات الإفلاس`
  )
}

/** «1448/03/15هـ» — التاريخ الهجري بصيغة القالب */
function hijriForTemplate(iso: string | null): string {
  if (!iso) return '—'
  const h = fmtHijri(iso) // «15/03/1448 هـ» أو ما يعادلها
  const m = h.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  return m ? `${m[3]}/${m[2].padStart(2, '0')}/${m[1].padStart(2, '0')}هـ` : h
}

export function POAReissueDialog({
  poa,
  open,
  onOpenChange,
}: {
  poa: PowerOfAttorney
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const qc = useQueryClient()
  const me = useAuth((s) => s.teamMember?.id ?? null)
  const { data: contacts } = useContacts()
  const [contact, setContact] = useState<Contact | null>(null)
  const [how, setHow] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  // موكّل ملف الوكالة — المصدر الثاني بعد جهة الوكالة نفسها
  const { data: caseContactId } = useQuery({
    queryKey: ['poa_case_contact', poa.case_id],
    enabled: open && !!poa.case_id,
    queryFn: async () => {
      const { data } = await supabase.from('cases').select('contact_id').eq('id', poa.case_id!).maybeSingle()
      return (data?.contact_id as string | null) ?? null
    },
  })

  // الاستنتاج مرة عند الفتح — والاختيار اليدوي يعلوه
  useEffect(() => {
    if (!open || !contacts || contact) return
    const byId = (id: string | null | undefined) => (id ? contacts.find((c) => c.id === id) ?? null : null)
    const own = byId(poa.client_id)
    if (own) {
      setContact(own)
      setHow('جهة الاتصال المسجّلة على الوكالة')
      return
    }
    const fromCase = byId(caseContactId)
    if (fromCase) {
      setContact(fromCase)
      setHow('موكّل الملف المرتبطة به الوكالة')
      return
    }
    const name = arNorm((poa.client_name ?? '').trim())
    if (name.length >= 4) {
      const hits = contacts.filter((c) => arNorm(c.name ?? '').trim() === name)
      if (hits.length === 1) {
        setContact(hits[0])
        setHow('تطابق اسم الموكّل في جهات الاتصال')
      }
    }
  }, [open, contacts, caseContactId, poa.client_id, poa.client_name, contact])

  const recipientName = contact?.name || poa.client_name || 'الموكّل'
  const expiry = hijriForTemplate(poa.expiry_date)
  const text = useMemo(
    () => previewText(recipientName, poa.poa_number || '—', expiry),
    [recipientName, poa.poa_number, expiry]
  )
  const phone = contact?.phone || contact?.phone2 || null

  const send = async () => {
    if (!contact || !phone || sending) return
    setSending(true)
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-send', {
        body: {
          phone,
          recipient_name: recipientName,
          template: {
            name: POA_REISSUE_TEMPLATE,
            lang: 'ar',
            params: [recipientName, poa.poa_number || '—', expiry],
          },
          idempotency_key: `poa-reissue:${poa.id}:${new Date().toISOString().slice(0, 10)}`,
        },
      })
      if (error || data?.error || data?.status === 'failed') {
        const d = String(data?.detail || data?.error || errMessage(error) || '')
        throw new Error(
          /not_approved|template_not_approved/.test(d) || /not_approved/.test(String(data?.code ?? ''))
            ? 'قالب طلب إعادة الإصدار ما زال قيد اعتماد ميتا — جرّب بعد اعتماده'
            : d || 'تعذّر الإرسال'
        )
      }
      // يُحفظ الطلب، ويُربط الموكّل بالوكالة إن لم يكن مربوطاً — فلا يُسأل عنه مرة ثانية
      const patch: Record<string, unknown> = {
        reissue_requested_at: new Date().toISOString(),
        reissue_requested_by: me,
      }
      if (!poa.client_id) patch.client_id = contact.id
      await supabase.from('powers_of_attorney').update(patch).eq('id', poa.id)
      await qc.invalidateQueries({ queryKey: ['poas'] })
      toast({ variant: 'success', title: 'أُرسل طلب إعادة إصدار الوكالة واتساباً', description: `إلى ${recipientName}` })
      onOpenChange(false)
    } catch (e) {
      toast({ variant: 'destructive', title: 'تعذّر إرسال الطلب', description: errMessage(e) })
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !sending && onOpenChange(v)}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-emerald-600" />
            طلب إعادة إصدار الوكالة
          </DialogTitle>
          <DialogDescription>
            يصل الموكّل عبر واتساب برسالة رسمية معتمدة — حتى لو لم يراسلنا مؤخراً.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {poa.reissue_requested_at && (
            <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
              أُرسل طلب سابق {fmtDateTime(poa.reissue_requested_at)} — الإرسال الآن يكرّره.
            </p>
          )}

          <div className="space-y-1.5">
            <Label>إلى</Label>
            <ContactPicker
              contacts={contacts ?? []}
              value={contact?.id ?? null}
              onSelect={(c) => {
                setContact(c)
                setHow(c ? 'اختيار يدوي — يُربط بالوكالة بعد الإرسال' : null)
              }}
              placeholder="اختر الموكّل من جهات الاتصال…"
            />
            {contact && (
              <p className="text-xs text-muted-foreground">
                {phone ? <bdi dir="ltr">{phone}</bdi> : <span className="text-destructive">لا جوال لهذه الجهة</span>}
                {how && ` · ${how}`}
              </p>
            )}
            {!contact && contacts && (
              <p className="text-xs text-muted-foreground">
                لم يُعرف الموكّل تلقائياً{poa.client_name ? ` («${poa.client_name}»)` : ''} — اختره من القائمة.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>الرسالة كما ستصل</Label>
            <p className="whitespace-pre-wrap rounded-xl border bg-emerald-500/[0.04] px-3 py-2.5 text-sm leading-relaxed text-foreground">
              {text}
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="gold" onClick={send} disabled={!contact || !phone || sending}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            إرسال
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
