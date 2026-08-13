import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, RefreshCw, UserCheck } from 'lucide-react'

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/stores/auth'
import { useApproveApplication } from '@/hooks/useStaffApplications'
import { ROLE_OPTIONS } from './labels'
import type { StaffApplication } from '@/types/db'

// توليد كلمة مرور قوية (أحرف كبيرة/صغيرة/أرقام/رموز)
// عشوائية مشفّرة عبر crypto.getRandomValues — لا تستخدم Math.random (غير آمن).
function randomInt(maxExclusive: number): number {
  // رفض العيّنات المنحازة (rejection sampling) لتوزيع منتظم
  const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive
  const buf = new Uint32Array(1)
  let v: number
  do {
    crypto.getRandomValues(buf)
    v = buf[0]
  } while (v >= limit)
  return v % maxExclusive
}

function generatePassword(len = 12): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower = 'abcdefghijkmnpqrstuvwxyz'
  const digits = '23456789'
  const symbols = '!@#$%*?'
  const all = upper + lower + digits + symbols
  const pick = (s: string) => s[randomInt(s.length)]
  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)]
  for (let i = chars.length; i < len; i++) chars.push(pick(all))
  // خلط Fisher–Yates بعشوائية مشفّرة
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

const schema = z.object({
  email: z
    .string()
    .min(1, 'البريد مطلوب')
    .email('صيغة البريد غير صحيحة'),
  password: z.string().min(8, 'كلمة المرور 8 أحرف على الأقل'),
  role: z.string().min(1, 'الدور مطلوب'),
})

type FormValues = z.infer<typeof schema>

export function ApproveDialog({
  application,
  open,
  onOpenChange,
}: {
  application: StaffApplication
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const { teamMember } = useAuth()
  const approveM = useApproveApplication()

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: application.email ?? '',
      password: generatePassword(),
      role: 'موظف',
    },
  })

  const onSubmit = (values: FormValues) => {
    approveM.mutate(
      {
        application,
        email: values.email.trim(),
        password: values.password,
        role: values.role,
        reviewerName: teamMember?.name ?? null,
      },
      {
        onSuccess: () => onOpenChange(false),
      }
    )
  }

  return (
    // أثناء الاعتماد (إنشاء حساب + SMS) لا يُغلق الحوار — يمنع تكرار الإنشاء
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!approveM.isPending) onOpenChange(o)
      }}
    >
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-gold" />
              اعتماد وإنشاء حساب
            </DialogTitle>
          </DialogHeader>

          {/* ملخّص الطلب */}
          <div className="my-3 rounded-lg bg-muted/50 p-3 text-sm">
            <p className="font-medium text-foreground">
              {application.full_name}
            </p>
            {application.phone && (
              <p dir="ltr" className="text-right text-xs text-muted-foreground">
                {application.phone}
              </p>
            )}
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="approve_email">البريد الإلكتروني (للدخول)</Label>
              <Input
                id="approve_email"
                type="email"
                dir="ltr"
                {...register('email')}
              />
              {errors.email && (
                <p className="text-xs text-destructive">
                  {errors.email.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="approve_password">كلمة المرور</Label>
              <div className="flex gap-2">
                <Input
                  id="approve_password"
                  dir="ltr"
                  {...register('password')}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  title="توليد كلمة مرور"
                  onClick={() =>
                    setValue('password', generatePassword(), {
                      shouldValidate: true,
                    })
                  }
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
              {errors.password && (
                <p className="text-xs text-destructive">
                  {errors.password.message}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                ستُرسل للموظف عبر SMS ولن تُخزَّن في النظام.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>الدور / المسمى</Label>
              <Controller
                control={control}
                name="role"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="اختر الدور" />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <DialogFooter className="mt-4 gap-2">
            <Button type="submit" variant="gold" disabled={approveM.isPending}>
              {approveM.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              {approveM.isPending ? 'جارٍ الاعتماد…' : 'اعتماد وإنشاء حساب'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={approveM.isPending}
            >
              إلغاء
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
