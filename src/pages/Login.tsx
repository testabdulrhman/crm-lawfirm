import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useLocation } from 'wouter'
import { Loader2, Scale, KeyRound, Smartphone, ArrowRight } from 'lucide-react'

import { useAuth } from '@/stores/auth'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { COMPANY_NAME } from '@/lib/constants'

const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'البريد الإلكتروني مطلوب')
    .email('صيغة البريد الإلكتروني غير صحيحة'),
  password: z.string().min(1, 'كلمة المرور مطلوبة'),
})

type LoginValues = z.infer<typeof loginSchema>
type Tab = 'password' | 'otp'

export default function Login() {
  const [tab, setTab] = useState<Tab>('password')

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-navy-700 via-navy to-navy-900 p-4">
      <div className="w-full max-w-md">
        {/* الشعار */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gold/15 ring-1 ring-gold/30">
            <Scale className="h-9 w-9 text-gold" />
          </div>
          <h1 className="text-balance text-lg font-bold leading-relaxed text-gold">
            {COMPANY_NAME}
          </h1>
        </div>

        {/* البطاقة */}
        <div className="rounded-2xl bg-white p-8 shadow-2xl dark:bg-card">
          <h2 className="mb-1 text-xl font-bold text-navy dark:text-foreground">
            تسجيل الدخول
          </h2>
          <p className="mb-6 text-sm text-muted-foreground">
            أدخل بياناتك للوصول إلى نظام إدارة المكتب
          </p>

          {/* مبدّل طريقة الدخول */}
          <div className="mb-6 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
            <TabButton
              active={tab === 'password'}
              onClick={() => setTab('password')}
              icon={KeyRound}
              label="كلمة المرور"
            />
            <TabButton
              active={tab === 'otp'}
              onClick={() => setTab('otp')}
              icon={Smartphone}
              label="رمز عبر الجوال"
            />
          </div>

          {tab === 'password' ? <PasswordForm /> : <OtpForm />}
        </div>
      </div>
    </div>
  )
}


/** الوجهة المقصودة قبل تحويله للدخول (رابط قضية مثلاً) — أو الرئيسية */
function afterLoginPath(): string {
  try {
    const to = sessionStorage.getItem('redirect-after-login')
    sessionStorage.removeItem('redirect-after-login')
    if (to && to.startsWith('/') && !to.startsWith('//')) return to
  } catch {
    /* تجاهل */
  }
  return '/'
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: typeof KeyRound
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-white text-navy shadow-sm dark:bg-background dark:text-foreground'
          : 'text-muted-foreground hover:text-foreground'
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  )
}

/* ===================== دخول بكلمة المرور ===================== */

function PasswordForm() {
  const login = useAuth((s) => s.login)
  const [, navigate] = useLocation()
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  const onSubmit = async (values: LoginValues) => {
    setServerError(null)
    const res = await login(values.email, values.password)
    if (res.ok) navigate(afterLoginPath())
    else if (res.error === 'account_disabled')
      setServerError('هذا الحساب موقوف. تواصل مع إدارة المكتب.')
    else setServerError('تعذّر تسجيل الدخول. تحقّق من البريد وكلمة المرور.')
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="email">البريد الإلكتروني</Label>
        <Input
          id="email"
          type="email"
          dir="ltr"
          className="text-left"
          placeholder="name@example.com"
          autoComplete="username"
          {...register('email')}
        />
        {errors.email && (
          <p className="text-xs text-destructive">{errors.email.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">كلمة المرور</Label>
        <Input
          id="password"
          type="password"
          dir="ltr"
          className="text-left"
          placeholder="••••••••"
          autoComplete="current-password"
          {...register('password')}
        />
        {errors.password && (
          <p className="text-xs text-destructive">{errors.password.message}</p>
        )}
      </div>

      {serverError && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {serverError}
        </div>
      )}

      <Button
        type="submit"
        variant="gold"
        className="w-full"
        disabled={isSubmitting}
      >
        {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
        دخول
      </Button>
    </form>
  )
}

/* ===================== دخول برمز عبر الجوال (OTP) ===================== */

function OtpForm() {
  const loginWithSession = useAuth((s) => s.loginWithSession)
  const [, navigate] = useLocation()

  const [step, setStep] = useState<'phone' | 'code'>('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const sendCode = async () => {
    setError(null)
    setInfo(null)
    const p = phone.trim()
    if (p.replace(/\D/g, '').length < 9) {
      setError('أدخل رقم جوال صحيح.')
      return
    }
    setBusy(true)
    try {
      const { error: err } = await supabase.functions.invoke('staff-login-otp', {
        body: { action: 'send', phone: p },
      })
      if (err) throw err
      setStep('code')
      setInfo('إن كان الرقم مسجّلاً لموظف، فسيصلك رمز عبر رسالة نصية.')
    } catch {
      setError('تعذّر إرسال الرمز. حاول مرة أخرى.')
    } finally {
      setBusy(false)
    }
  }

  const verifyCode = async () => {
    setError(null)
    const c = code.trim()
    if (c.length < 4) {
      setError('أدخل الرمز المرسَل.')
      return
    }
    setBusy(true)
    try {
      const { data, error: err } = await supabase.functions.invoke(
        'staff-login-otp',
        { body: { action: 'verify', phone: phone.trim(), code: c } }
      )
      if (err || !data?.ok || !data?.access_token) {
        setError(data?.error ?? 'الرمز غير صحيح أو منتهي الصلاحية.')
        return
      }
      const res = await loginWithSession(data.access_token, data.refresh_token)
      if (res.ok) navigate(afterLoginPath())
      else if (res.error === 'account_disabled')
        setError('هذا الحساب موقوف. تواصل مع إدارة المكتب.')
      else setError('تعذّر إكمال الدخول. حاول مرة أخرى.')
    } catch {
      setError('تعذّر التحقّق من الرمز. حاول مرة أخرى.')
    } finally {
      setBusy(false)
    }
  }

  if (step === 'phone') {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="otp-phone">رقم الجوال</Label>
          <Input
            id="otp-phone"
            type="tel"
            inputMode="tel"
            dir="ltr"
            className="text-left"
            placeholder="05XXXXXXXX"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendCode()}
          />
          <p className="text-xs text-muted-foreground">
            أدخل رقم جوالك المسجّل لدى المكتب لإرسال رمز الدخول.
          </p>
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <Button
          type="button"
          variant="gold"
          className="w-full"
          disabled={busy}
          onClick={sendCode}
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          إرسال الرمز
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="otp-code">رمز التحقّق</Label>
        <Input
          id="otp-code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          dir="ltr"
          className="text-center text-lg tracking-[0.4em]"
          placeholder="••••••"
          maxLength={8}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && verifyCode()}
        />
        {info && <p className="text-xs text-muted-foreground">{info}</p>}
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <Button
        type="button"
        variant="gold"
        className="w-full"
        disabled={busy}
        onClick={verifyCode}
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        دخول
      </Button>

      <div className="flex items-center justify-between text-xs">
        <button
          type="button"
          className="flex items-center gap-1 text-muted-foreground hover:text-gold"
          onClick={() => {
            setStep('phone')
            setCode('')
            setError(null)
            setInfo(null)
          }}
        >
          <ArrowRight className="h-3 w-3" />
          تغيير الرقم
        </button>
        <button
          type="button"
          className="text-muted-foreground hover:text-gold disabled:opacity-50"
          disabled={busy}
          onClick={sendCode}
        >
          إعادة إرسال الرمز
        </button>
      </div>
    </div>
  )
}
