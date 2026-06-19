import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useLocation } from 'wouter'
import { Loader2, Scale } from 'lucide-react'

import { useAuth } from '@/stores/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { COMPANY_NAME } from '@/lib/constants'

const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'البريد الإلكتروني مطلوب')
    .email('صيغة البريد الإلكتروني غير صحيحة'),
  password: z.string().min(1, 'كلمة المرور مطلوبة'),
})

type LoginValues = z.infer<typeof loginSchema>

export default function Login() {
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
    if (res.ok) {
      navigate('/')
    } else {
      setServerError('تعذّر تسجيل الدخول. تحقّق من البريد وكلمة المرور.')
    }
  }

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
                <p className="text-xs text-destructive">
                  {errors.password.message}
                </p>
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

            <div className="text-center">
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-gold"
                onClick={() =>
                  setServerError('ميزة استعادة كلمة المرور ستتوفّر قريباً.')
                }
              >
                نسيت كلمة المرور؟
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
