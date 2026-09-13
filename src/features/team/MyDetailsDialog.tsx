// «تحديث بياناتي» — الموظف يحدّث بيانات التواصل والبنك والطوارئ بنفسه (2026-09-13).
// الاسم والمسمّى والبريد ورقم الهوية وتاريخ التعيين يحرسها ترقر القاعدة للمدير
// (tm_guard_privilege_fields) — وتاريخ التعيين أساس رصيد الإجازات.
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Pencil } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import { errMessage } from '@/lib/errors'
import type { TeamMember } from '@/types/db'

const FIELDS = [
  ['phone', 'الجوال', 'ltr'],
  ['national_address', 'العنوان الوطني', 'rtl'],
  ['bank_name', 'اسم البنك', 'rtl'],
  ['bank_iban', 'الآيبان', 'ltr'],
  ['emergency_contact_name', 'جهة الاتصال للطوارئ', 'rtl'],
  ['emergency_contact_relation', 'صلة القرابة', 'rtl'],
  ['emergency_contact_phone', 'جوال الطوارئ', 'ltr'],
] as const

type Key = (typeof FIELDS)[number][0] | 'qualifications'

export function MyDetailsDialog({ member }: { member: TeamMember }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)

  const initial = (): Record<Key, string> => ({
    phone: member.phone ?? '',
    national_address: member.national_address ?? '',
    bank_name: member.bank_name ?? '',
    bank_iban: member.bank_iban ?? '',
    emergency_contact_name: member.emergency_contact_name ?? '',
    emergency_contact_relation: member.emergency_contact_relation ?? '',
    emergency_contact_phone: member.emergency_contact_phone ?? '',
    qualifications: member.qualifications ?? '',
  })
  const [form, setForm] = useState(initial)

  // آيبان سعودي: SA + ٢٢ رقماً — فارغ مقبول
  const iban = form.bank_iban.replace(/\s/g, '').toUpperCase()
  const ibanValid = !iban || /^SA\d{22}$/.test(iban)

  const save = useMutation({
    mutationFn: async () => {
      const next: Record<Key, string> = { ...form, bank_iban: iban }
      const values: Record<string, string | null> = {}
      for (const k of Object.keys(next) as Key[]) {
        const v = next[k].trim()
        if (v !== ((member[k] as string | null) ?? '')) values[k] = v || null
      }
      if (!Object.keys(values).length) return
      const { error } = await supabase.from('team_members').update(values).eq('id', member.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast({ variant: 'success', title: 'حُدّثت بياناتك' })
      setOpen(false)
      return qc.invalidateQueries({ queryKey: ['team_members'] })
    },
    onError: (e) => toast({ variant: 'destructive', title: 'تعذّر حفظ بياناتك', description: errMessage(e) }),
  })

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setForm(initial())
          setOpen(true)
        }}
      >
        <Pencil className="h-4 w-4" />
        تحديث بياناتي
      </Button>
      <Dialog open={open} onOpenChange={(o) => !save.isPending && setOpen(o)}>
        <DialogContent className="max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>تحديث بياناتي</DialogTitle>
            <DialogDescription>الاسم والمسمّى والبريد ورقم الهوية وتاريخ التعيين يعدّلها المدير.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELDS.map(([k, label, dir]) => (
              <div key={k} className="space-y-1.5">
                <Label htmlFor={`me-${k}`}>{label}</Label>
                <Input
                  id={`me-${k}`}
                  dir={dir}
                  value={form[k]}
                  onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                />
              </div>
            ))}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="me-qualifications">المؤهلات</Label>
              <Textarea
                id="me-qualifications"
                rows={3}
                value={form.qualifications}
                onChange={(e) => setForm((f) => ({ ...f, qualifications: e.target.value }))}
              />
            </div>
          </div>
          {!ibanValid && <p className="text-xs text-destructive">الآيبان السعودي 24 خانة تبدأ بـ SA</p>}
          <DialogFooter className="gap-2">
            <Button variant="gold" disabled={!ibanValid || save.isPending} onClick={() => save.mutate()}>
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              حفظ
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={save.isPending}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
