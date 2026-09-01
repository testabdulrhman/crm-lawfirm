// عرض سعر PDF على نموذج المكتب المعتمد (عرض جوهرة العراب مرجعاً):
// ترويسة بالشعار والرقم المتسلسل ← عنوان ← مقدم إلى ← تمهيد ← نطاق العمل ←
// جدول الأتعاب (صافٍ + ضريبة ١٥٪ + إجمالي) مع التفقيط ← جدول الدفعات ←
// شروط وأحكام ← توقيعا الطرفين (بختم المكتب) ← تذييل التواصل.
// التوليد عميليّاً (html2canvas + jsPDF)، والرفع لمخزن documents العام
// ليصلح الرابط لواجهة هاتف، والإرسال عبر whatsapp-send.
import { useEffect, useRef, useState } from 'react'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import { Download, Loader2, Send, Sparkles } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import { errMessage } from '@/lib/errors'
import { normalizeSaudiPhone } from '@/lib/format'
import { tafqitSAR } from '@/lib/tafqit'
import { useOfficeInfo } from '@/hooks/useSettings'
import { typeLabel } from './labels'
import type { IncomingRequest } from '@/types/db'

const COMPANY = 'شركة عبدالرحمن بن رضوان المشيقح للمحاماة وإدارة إجراءات الإفلاس'
const VAT = 0.15

const NAVY = '#111D3A'
const GOLD = '#C9A84C'
const MUTED = '#8A8676'

// أرقام لاتينية بفواصل آلاف — أسلوب النموذج المرجعي
const money = (n: number, frac = 2) =>
  n.toLocaleString('en-US', { minimumFractionDigits: frac, maximumFractionDigits: frac })

interface PayRow {
  desc: string
  amount: string
}

export function QuotePdfDialog({
  request: r,
  open,
  onOpenChange,
}: {
  request: IncomingRequest
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const { data: office } = useOfficeInfo()
  const pageRef = useRef<HTMLDivElement>(null)

  const year = new Date().getFullYear()
  const [seq, setSeq] = useState<number | null>(null)
  const [title, setTitle] = useState(typeLabel(r.request_type))
  const [scope, setScope] = useState('')
  const [gross, setGross] = useState('')
  const [validity, setValidity] = useState('10')
  const [phone, setPhone] = useState(r.client_phone ?? '')
  const [pays, setPays] = useState<PayRow[]>([
    { desc: 'عند قبول العرض وتوقيع اتفاقية الأتعاب ومباشرة العمل', amount: '' },
    { desc: 'عند اكتمال العمل المتفق عليه', amount: '' },
    { desc: '', amount: '' },
  ])
  const [busy, setBusy] = useState<'download' | 'send' | null>(null)
  const [drafting, setDrafting] = useState(false)

  // صياغة نطاق العمل بالذكاء — يحلل ملاحظات الموظف ويعيدها بنوداً مرتبة
  // بأسلوب المكتب. النتيجة تحل محل النص ليراجعها الموظف قبل الإصدار.
  async function draftScope() {
    if (!title.trim()) {
      toast({ variant: 'destructive', title: 'اكتب عنوان العرض أولاً' })
      return
    }
    setDrafting(true)
    try {
      const { data, error } = await supabase.functions.invoke('quote-scope', {
        body: {
          title: title.trim(),
          notes: scope.trim(),
          context: {
            request_type: typeLabel(r.request_type),
            description: r.description,
            court_name: r.court_name,
            opponent_name: r.opponent_name,
          },
        },
      })
      if (error || data?.error)
        throw new Error(data?.detail || data?.error || errMessage(error))
      const items: string[] = data?.items ?? []
      if (!items.length) throw new Error('لم تُنتج صياغة')
      setScope(items.join('\n'))
      toast({ variant: 'success', title: `صيغت ${items.length} بنود — راجعها قبل الإصدار` })
    } catch (e) {
      toast({ variant: 'destructive', title: 'تعذّرت الصياغة', description: errMessage(e) })
    } finally {
      setDrafting(false)
    }
  }

  // الرقم المتسلسل السنوي — عداد في lookup_values (type=quote_counter, label=السنة)
  useEffect(() => {
    if (!open) return
    ;(async () => {
      const { data } = await supabase
        .from('lookup_values')
        .select('id, value')
        .eq('type', 'quote_counter')
        .eq('label', String(year))
        .maybeSingle()
      setSeq((Number(data?.value) || 0) + 1)
    })()
  }, [open, year])

  async function bumpCounter() {
    const label = String(year)
    const { data } = await supabase
      .from('lookup_values')
      .select('id')
      .eq('type', 'quote_counter')
      .eq('label', label)
      .maybeSingle()
    if (data?.id) {
      await supabase.from('lookup_values').update({ value: String(seq) }).eq('id', data.id)
    } else {
      await supabase.from('lookup_values').insert({ type: 'quote_counter', label, value: String(seq) })
    }
  }

  const grossN = Number(gross.replace(/[^\d.]/g, '')) || 0
  const netN = grossN / (1 + VAT)
  const vatN = grossN - netN
  const scopeLines = scope.split('\n').map((l) => l.trim()).filter(Boolean)
  const payRows = pays.filter((p) => p.desc.trim() && Number(p.amount) > 0)
  const ready = title.trim() && grossN > 0

  const quoteNo = seq != null ? `${year} / ${String(seq).padStart(3, '0')}` : '…'
  const today = new Date()
  const dateStr = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}م`

  async function buildPdf(): Promise<Blob> {
    const canvas = await html2canvas(pageRef.current!, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
    })
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297)
    return pdf.output('blob')
  }

  async function download() {
    if (!ready) return
    setBusy('download')
    try {
      const blob = await buildPdf()
      await bumpCounter()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `عرض سعر ${quoteNo.replace(' / ', '-')} - ${r.client_name ?? ''}.pdf`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch (e) {
      toast({ variant: 'destructive', title: 'تعذّر توليد الملف', description: errMessage(e) })
    } finally {
      setBusy(null)
    }
  }

  async function sendWhatsApp() {
    if (!ready) return
    const intl = normalizeSaudiPhone(phone)
    if (intl.length !== 12 || !intl.startsWith('9665')) {
      toast({ variant: 'destructive', title: 'أدخل رقم جوال سعودي صحيح' })
      return
    }
    setBusy('send')
    try {
      const blob = await buildPdf()
      const path = `quotes/${r.id}-${Date.now()}.pdf`
      const { error: upErr } = await supabase.storage
        .from('documents')
        .upload(path, blob, { contentType: 'application/pdf' })
      if (upErr) throw upErr
      const url = supabase.storage.from('documents').getPublicUrl(path).data.publicUrl

      const fileName = `عرض سعر ${quoteNo.replace(' / ', '-')}.pdf`
      const recipient = r.client_name ?? 'عميل'

      // ١) ملف حر — يمشي داخل نافذة الـ٢٤ ساعة (العميل راسلنا مؤخراً)
      const { data, error } = await supabase.functions.invoke('whatsapp-send', {
        body: {
          phone: intl,
          media_url: url,
          file_name: fileName,
          message: `عرض سعر رقم ${quoteNo} — ${COMPANY}`,
          recipient_name: recipient,
        },
      })

      // ٢) النافذة مغلقة؟ نرتد للقالب المعتمد بترويسة المستند — يصل دائماً
      const windowClosed =
        data?.code === 'Voxa:WhatsApp:ServiceWindowExpired' ||
        String(data?.detail ?? '').includes('نافذة الـ٢٤ ساعة')
      if (windowClosed) {
        const { data: t, error: tErr } = await supabase.functions.invoke('whatsapp-send', {
          body: {
            phone: intl,
            recipient_name: recipient,
            template: {
              name: 'quote_document',
              lang: 'ar',
              params: [recipient, quoteNo, String(Number(validity) || 10)],
              document: { url, name: fileName },
            },
          },
        })
        if (tErr || t?.error)
          throw new Error(
            `${t?.detail || t?.error || errMessage(tErr)} — تأكد من اعتماد قالب quote_document في لوحة هاتف`
          )
      } else if (error || data?.error) {
        throw new Error(data?.detail || data?.error || errMessage(error))
      }
      await bumpCounter()
      toast({ variant: 'success', title: `أُرسل عرض السعر ${quoteNo} واتساباً 📄` })
      onOpenChange(false)
    } catch (e) {
      toast({ variant: 'destructive', title: 'تعذّر الإرسال', description: errMessage(e) })
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>عرض سعر PDF — رقم {quoteNo}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="q-title">عنوان العرض *</Label>
            <Input
              id="q-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثال: إعداد وتقديم طلب افتتاح إجراء إعادة التنظيم المالي"
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="q-scope">نطاق العمل (سطر لكل بند — اختياري)</Label>
              <button
                type="button"
                onClick={draftScope}
                disabled={drafting || !title.trim()}
                className="inline-flex items-center gap-1 rounded-lg bg-gold/15 px-2.5 py-1 text-[11px] font-semibold text-gold-700 transition-colors hover:bg-gold/25 disabled:opacity-50 dark:text-gold"
              >
                {drafting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                صياغة بالذكاء
              </button>
            </div>
            <Textarea
              id="q-scope"
              rows={4}
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              placeholder={'دراسة الوضع النظامي ومراجعة المستندات\nإعداد الطلب واستيفاء متطلباته\nالمتابعة حتى صدور القرار'}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="q-gross">الإجمالي شامل الضريبة (ر.س) *</Label>
              <Input
                id="q-gross"
                dir="ltr"
                inputMode="numeric"
                value={gross}
                onChange={(e) => setGross(e.target.value)}
              />
              {grossN > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  الصافي {money(netN)} + ضريبة {money(vatN)}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="q-validity">سريان العرض (أيام)</Label>
              <Input
                id="q-validity"
                dir="ltr"
                inputMode="numeric"
                value={validity}
                onChange={(e) => setValidity(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>جدول الدفعات (اختياري — الصف بلا مبلغ يُهمل)</Label>
            {pays.map((p, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  value={p.desc}
                  placeholder="استحقاق الدفعة"
                  onChange={(e) =>
                    setPays((a) => a.map((x, j) => (j === i ? { ...x, desc: e.target.value } : x)))
                  }
                />
                <Input
                  dir="ltr"
                  inputMode="numeric"
                  className="w-28 shrink-0"
                  value={p.amount}
                  placeholder="المبلغ"
                  onChange={(e) =>
                    setPays((a) => a.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))
                  }
                />
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="q-phone">جوال العميل (للواتساب)</Label>
            <Input
              id="q-phone"
              dir="ltr"
              inputMode="tel"
              placeholder="05xxxxxxxx"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={!ready || busy !== null} onClick={download}>
            {busy === 'download' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            تنزيل
          </Button>
          <Button variant="gold" disabled={!ready || busy !== null} onClick={sendWhatsApp}>
            {busy === 'send' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            إرسال واتساب
          </Button>
        </DialogFooter>

        {/* ===== صفحة A4 المخفية — على نموذج المكتب المعتمد ===== */}
        <div className="pointer-events-none fixed -start-[2200px] top-0" aria-hidden>
          <div
            ref={pageRef}
            dir="rtl"
            style={{
              width: 794,
              height: 1123,
              background: '#ffffff',
              color: NAVY,
              fontFamily: "'IBM Plex Sans Arabic', sans-serif",
              display: 'flex',
              flexDirection: 'column',
              padding: '42px 52px 34px',
              boxSizing: 'border-box',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* علامة مائية — الشعار باهتاً في الوسط */}
            {office?.logo_url && (
              <img
                src={office.logo_url}
                crossOrigin="anonymous"
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: 420,
                  opacity: 0.04,
                }}
              />
            )}

            {/* الترويسة: شعار يميناً + بيانات العرض يساراً */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {office?.logo_url && (
                  <img
                    src={office.logo_url}
                    crossOrigin="anonymous"
                    style={{ height: 64, objectFit: 'contain' }}
                  />
                )}
                <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.55, maxWidth: 250 }}>
                  شركة
                  <br />
                  عبدالرحمن بن رضوان المشيقح
                  <br />
                  <span style={{ fontSize: 12.5, fontWeight: 500 }}>
                    للمحاماة وإدارة إجراءات الإفلاس
                  </span>
                </div>
              </div>
              <div style={{ fontSize: 12, lineHeight: 2.1, textAlign: 'left' }}>
                <div>
                  <span style={{ color: MUTED }}>رقم العرض&nbsp;&nbsp;</span>
                  <b>{quoteNo}</b>
                </div>
                <div>
                  <span style={{ color: MUTED }}>التاريخ&nbsp;&nbsp;</span>
                  <b>{dateStr}</b>
                </div>
                <div>
                  <span style={{ color: MUTED }}>سريان العرض&nbsp;&nbsp;</span>
                  <b>({validity || '10'}) أيام من تاريخه</b>
                </div>
              </div>
            </div>

            <div style={{ height: 1.5, background: '#D9D5C9', margin: '16px 0 18px' }} />

            {/* العنوان */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontSize: 27, fontWeight: 800 }}>عرض سعر</span>
              <span style={{ color: GOLD, fontSize: 16 }}>◆</span>
              <span style={{ fontSize: 16.5, fontWeight: 700 }}>{title}</span>
            </div>

            {/* مقدم إلى */}
            <div
              style={{
                marginTop: 14,
                background: '#F5F2EA',
                borderRadius: 10,
                padding: '10px 16px',
                fontSize: 14,
              }}
            >
              <span style={{ color: MUTED }}>مقدم إلى&nbsp;&nbsp;</span>
              <b>السادة / {r.client_name ?? ''}</b> — المحترمين
            </div>

            {/* التمهيد */}
            <div style={{ marginTop: 12, fontSize: 12.8, lineHeight: 2 }}>
              تحية طيبة، وبعد: يسرّنا أن نتقدم لكم بعرض أتعابنا المهنية عن{' '}
              <b>{title}</b>، وعلى التفصيل الآتي:
            </div>

            {/* نطاق العمل */}
            {scopeLines.length > 0 && (
              <>
                <SectionHead>نطاق العمل</SectionHead>
                <div style={{ fontSize: 12.6, lineHeight: 1.95 }}>
                  {scopeLines.map((l, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8 }}>
                      <span style={{ color: GOLD }}>◆</span>
                      <span>{l}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* الأتعاب المهنية */}
            <SectionHead>الأتعاب المهنية</SectionHead>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.6 }}>
              <thead>
                <tr style={{ background: NAVY, color: '#fff' }}>
                  <th style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 700 }}>البيان</th>
                  <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 700, width: 150 }}>
                    المبلغ (ر.س)
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid #E3E0D6' }}>
                  <td style={{ padding: '9px 14px' }}>الأتعاب المهنية — {title}</td>
                  <td style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 700 }} dir="ltr">
                    {money(netN)}
                  </td>
                </tr>
                <tr style={{ borderBottom: '1px solid #E3E0D6' }}>
                  <td style={{ padding: '9px 14px' }}>ضريبة القيمة المضافة (15%)</td>
                  <td style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 700 }} dir="ltr">
                    {money(vatN)}
                  </td>
                </tr>
                <tr style={{ background: '#F5F2EA' }}>
                  <td style={{ padding: '9px 14px', fontWeight: 800 }}>
                    الإجمالي شاملاً ضريبة القيمة المضافة
                  </td>
                  <td
                    style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 800, color: '#8C7129' }}
                    dir="ltr"
                  >
                    {money(grossN)}
                  </td>
                </tr>
              </tbody>
            </table>
            {grossN > 0 && (
              <div style={{ marginTop: 6, fontSize: 11.3, color: MUTED }}>
                {tafqitSAR(grossN)}، شاملاً ضريبة القيمة المضافة.
              </div>
            )}

            {/* جدول الدفعات */}
            {payRows.length > 0 && (
              <>
                <SectionHead>جدول الدفعات</SectionHead>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.6 }}>
                  <thead>
                    <tr style={{ background: NAVY, color: '#fff' }}>
                      <th style={{ padding: '7px 14px', textAlign: 'right', width: 70, fontWeight: 700 }}>
                        الدفعة
                      </th>
                      <th style={{ padding: '7px 14px', textAlign: 'right', fontWeight: 700 }}>الاستحقاق</th>
                      <th style={{ padding: '7px 14px', textAlign: 'left', width: 130, fontWeight: 700 }}>
                        المبلغ (ر.س)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {payRows.map((p, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #E3E0D6' }}>
                        <td style={{ padding: '8px 14px', fontWeight: 700 }}>
                          {['الأولى', 'الثانية', 'الثالثة'][i] ?? i + 1}
                        </td>
                        <td style={{ padding: '8px 14px' }}>{p.desc}</td>
                        <td style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 700 }} dir="ltr">
                          {money(Number(p.amount), 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {/* شروط وأحكام */}
            <SectionHead>شروط وأحكام</SectionHead>
            <div style={{ fontSize: 11.6, lineHeight: 1.95, color: '#2A3350' }}>
              <div>
                1. هذا العرض سارٍ لمدة ({validity || '10'}) أيام من تاريخ إصداره، ويُعد لاغيًا بعد
                انقضائها ما لم يُتفق على تمديده كتابةً.
              </div>
              <div>
                2. الأتعاب أعلاه شاملة ضريبة القيمة المضافة (15%)
                {payRows.length > 0 ? '، وتستحق كل دفعة عند تحقق موجبها وفق جدول الدفعات.' : '.'}
              </div>
              <div>
                3. لا تشمل الأتعاب الرسوم القضائية أو الحكومية أو أتعاب الخبراء — إن وُجدت — وتكون
                على حساب العميل.
              </div>
              <div>4. نلتزم بالسرية التامة تجاه جميع المستندات والمعلومات المتعلقة بكم.</div>
            </div>

            {/* التوقيعات */}
            <div
              style={{
                marginTop: 'auto',
                display: 'flex',
                justifyContent: 'space-between',
                gap: 40,
                paddingTop: 18,
              }}
            >
              <div style={{ flex: 1, position: 'relative' }}>
                <div style={{ fontSize: 13, fontWeight: 800 }}>مقدم العرض</div>
                <div style={{ fontSize: 11.6, color: '#2A3350', marginTop: 4 }}>{COMPANY}</div>
                {office?.stamp_url && (
                  <img
                    src={office.stamp_url}
                    crossOrigin="anonymous"
                    style={{
                      position: 'absolute',
                      top: -8,
                      left: 10,
                      height: 96,
                      objectFit: 'contain',
                      opacity: 0.9,
                    }}
                  />
                )}
                <div style={{ borderTop: '1px solid #C9C4B4', marginTop: 46, paddingTop: 5, fontSize: 10.5, color: MUTED }}>
                  الاسم والتوقيع والختم
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 800 }}>الموافقة على العرض</div>
                <div style={{ fontSize: 11.6, color: '#2A3350', marginTop: 4 }}>
                  {r.client_name ?? ''}
                </div>
                <div style={{ borderTop: '1px solid #C9C4B4', marginTop: 46, paddingTop: 5, fontSize: 10.5, color: MUTED }}>
                  الاسم والصفة والتوقيع والتاريخ
                </div>
              </div>
            </div>

            {/* التذييل */}
            <div style={{ borderTop: `2px solid ${NAVY}`, marginTop: 16, paddingTop: 8 }}>
              <div
                dir="ltr"
                style={{
                  fontSize: 11,
                  color: MUTED,
                  display: 'flex',
                  justifyContent: 'center',
                  gap: 14,
                  flexWrap: 'wrap',
                }}
              >
                <span>www.redwan.sa</span>
                <span style={{ color: GOLD }}>◆</span>
                {office?.email && (
                  <>
                    <span>{office.email}</span>
                    <span style={{ color: GOLD }}>◆</span>
                  </>
                )}
                {office?.phone && <span>{office.phone}</span>}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        margin: '16px 0 8px',
      }}
    >
      <span style={{ color: GOLD, fontSize: 13 }}>◆</span>
      <span style={{ fontSize: 14.5, fontWeight: 800 }}>{children}</span>
      <span style={{ flex: 1, height: 1, background: '#D9D5C9' }} />
    </div>
  )
}
