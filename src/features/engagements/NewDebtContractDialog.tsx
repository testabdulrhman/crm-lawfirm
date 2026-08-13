// إنشاء عقد «تحصيل ديون مقابل نسبة» من النموذج المعتمد:
// إدخال البيانات ← ملف Word جاهز (تنزيل) + إنشاء العقد في النظام بالملف مرفقاً
import { useMemo, useState } from 'react'
import { useLocation } from 'wouter'
import { Loader2, FileText } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ContactPicker } from '@/components/ContactPicker'
import { DualDatePicker } from '@/components/DualDatePicker'
import { Ltr } from '@/components/Ltr'

import { todayISO } from '@/lib/format'
import { uploadFile } from '@/lib/files'
import { errMessage } from '@/lib/errors'
import { toast } from '@/hooks/use-toast'
import { useAuth } from '@/stores/auth'
import { useContacts } from '@/hooks/useContacts'
import { useEngagements, useCreateEngagement } from '@/hooks/useEngagements'
import { generateDebtContract } from './contractTemplate'
import type { Contact } from '@/types/db'

const ID_TYPES = ['سجل مدني', 'سجل تجاري', 'إقامة', 'جواز سفر']

export function NewDebtContractDialog({ onDone }: { onDone: () => void }) {
  const [, navigate] = useLocation()
  const { teamMember } = useAuth()
  const { data: contacts } = useContacts()
  const { data: engagements } = useEngagements()
  const createM = useCreateEngagement()

  const [clientId, setClientId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [idType, setIdType] = useState('سجل مدني')
  const [idNum, setIdNum] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [pct, setPct] = useState('9')
  const [signedDate, setSignedDate] = useState<string | null>(todayISO())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // رقم العقد التالي CTR-YY-NNN (نفس منطق نموذج العقد)
  const nextNumber = useMemo(() => {
    const yy = String(new Date().getFullYear() % 100).padStart(2, '0')
    const re = new RegExp(`^CTR-${yy}-(\\d+)$`)
    const max = (engagements ?? []).reduce((m, e) => {
      const match = e.engagement_number?.trim().match(re)
      return match ? Math.max(m, parseInt(match[1], 10)) : m
    }, 0)
    return `CTR-${yy}-${String(max + 1).padStart(3, '0')}`
  }, [engagements])

  const onPickContact = (c: Contact | null) => {
    setClientId(c?.id ?? null)
    if (c) {
      if (!name.trim()) setName(c.name ?? '')
      if (!phone.trim() && c.phone) setPhone(c.phone)
      if (!email.trim() && c.email) setEmail(c.email)
    }
  }

  const submit = async () => {
    const pctNum = Number(pct.replace(/[^\d]/g, ''))
    if (!name.trim()) return setError('اسم الطرف الأول مطلوب.')
    if (!idNum.trim()) return setError('رقم الهوية/السجل مطلوب.')
    if (!phone.trim()) return setError('رقم الجوال مطلوب.')
    if (!pctNum || pctNum < 1 || pctNum > 99)
      return setError('النسبة يجب أن تكون بين 1 و99.')
    if (!signedDate) return setError('حدّد تاريخ العقد.')
    setError(null)
    setBusy(true)
    try {
      // 1) توليد الملف من القالب
      const blob = await generateDebtContract({
        name: name.trim(),
        idType,
        idNum: idNum.trim(),
        address: address.trim() || '—',
        phone: phone.trim(),
        email: email.trim(),
        pct: pctNum,
        signedDate,
      })
      const file = new File([blob], `debt-contract-${Date.now()}.docx`, {
        type: blob.type,
      })

      // 2) تنزيل نسخة للمستخدم فوراً
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `عقد تحصيل ديون - ${name.trim()}.docx`
      a.click()
      URL.revokeObjectURL(url)

      // 3) رفع الملف وإنشاء العقد في النظام
      const { publicUrl } = await uploadFile(file, { folder: 'engagements' })
      const created = await createM.mutateAsync({
        engagement_number: nextNumber,
        title: `عقد تحصيل ديون — ${name.trim()}`,
        type: 'collection',
        client_id: clientId,
        signed_date: signedDate,
        payment_terms: `نسبة ${pctNum}٪ من كل مبلغ يتم تحصيله (شاملة الضريبة)`,
        scope: 'تحصيل المستحقات المالية لدى الغير وفق النموذج المعتمد (مطالبات ودية، دعاوى، تنفيذ، تسويات).',
        status: 'draft',
        file_url: publicUrl,
        created_by: teamMember?.id ?? null,
      })
      toast({ title: 'أُنشئ العقد ونُزّل الملف' })
      onDone()
      navigate(`/engagements/${created.id}`)
    } catch (e) {
      setError(errMessage(e) ?? 'خطأ غير متوقع أثناء توليد العقد')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-gold" />
          عقد تحصيل ديون من النموذج
        </DialogTitle>
        <p className="text-xs text-muted-foreground">
          رقم العقد المقترح: <Ltr className="font-medium">{nextNumber}</Ltr>
        </p>
      </DialogHeader>

      <div className="my-4 max-h-[62vh] space-y-3 overflow-y-auto pl-1 pr-1">
        <div className="space-y-1.5">
          <Label>الموكّل (اختيار من جهات الاتصال يعبئ الاسم والجوال والبريد)</Label>
          <ContactPicker
            contacts={contacts ?? []}
            value={clientId}
            onSelect={onPickContact}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="dc_name">اسم الطرف الأول (كما سيظهر في العقد) *</Label>
          <Input id="dc_name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>نوع الهوية</Label>
            <Select value={idType} onValueChange={setIdType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ID_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dc_id">رقم الهوية/السجل *</Label>
            <Input
              id="dc_id"
              dir="ltr"
              inputMode="numeric"
              value={idNum}
              onChange={(e) => setIdNum(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="dc_addr">العنوان</Label>
          <Input
            id="dc_addr"
            placeholder="مثال: بريدة — حي الصفراء"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="dc_phone">الجوال *</Label>
            <Input
              id="dc_phone"
              dir="ltr"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dc_email">البريد الإلكتروني</Label>
            <Input
              id="dc_email"
              dir="ltr"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="dc_pct">نسبة الأتعاب ٪ *</Label>
            <Input
              id="dc_pct"
              dir="ltr"
              inputMode="numeric"
              value={pct}
              onChange={(e) => setPct(e.target.value)}
            />
          </div>
          <DualDatePicker
            label="تاريخ العقد"
            value={signedDate}
            onChange={setSignedDate}
          />
        </div>
      </div>

      {/* الخطأ خارج منطقة التمرير — يظهر دائماً فوق أزرار الحوار */}
      {error && (
        <p className="mb-2 text-xs font-medium text-destructive">{error}</p>
      )}

      <DialogFooter className="gap-2">
        <Button variant="gold" disabled={busy} onClick={submit}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          توليد العقد وإنشاؤه
        </Button>
        <Button variant="outline" onClick={onDone} disabled={busy}>
          إلغاء
        </Button>
      </DialogFooter>
    </>
  )
}
