// «حسابي» — بيانات المستخدم الحالي + تغيير كلمة المرور
import { useState } from 'react'
import { useLocation } from 'wouter'
import { BadgeCheck, KeyRound, Loader2, Phone, Mail, Wallet } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { UserAvatar } from '@/components/UserAvatar'
import { supabase } from '@/lib/supabase'
import { errMessage } from '@/lib/errors'
import { toast } from '@/hooks/use-toast'
import { useAuth } from '@/stores/auth'

export function AccountTab() {
  const [, navigate] = useLocation()
  const { teamMember } = useAuth()

  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const changePassword = async () => {
    if (pw.length < 8) {
      setError('كلمة المرور يجب أن تكون 8 أحرف على الأقل.')
      return
    }
    if (pw !== pw2) {
      setError('كلمتا المرور غير متطابقتين.')
      return
    }
    setError(null)
    setSaving(true)
    try {
      const { error: e } = await supabase.auth.updateUser({ password: pw })
      if (e) throw e
      setPw('')
      setPw2('')
      toast({ variant: 'success', title: 'غُيّرت كلمة المرور' })
    } catch (e) {
      setError(errMessage(e) ?? 'تعذّر تغيير كلمة المرور')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* بطاقة معلوماتي */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 pt-6">
          <UserAvatar member={teamMember} className="h-16 w-16" />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-lg font-bold text-foreground">
              {teamMember?.name ?? '—'}
              {teamMember?.is_director && <Badge variant="gold">مدير</Badge>}
            </p>
            {teamMember?.role && (
              <p className="text-sm text-muted-foreground">{teamMember.role}</p>
            )}
            <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
              {teamMember?.phone && (
                <span dir="ltr" className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" />
                  {teamMember.phone}
                </span>
              )}
              {teamMember?.email && (
                <span dir="ltr" className="flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" />
                  {teamMember.email}
                </span>
              )}
            </div>
          </div>
          {teamMember?.id && (
            <Button
              variant="outline"
              onClick={() => navigate(`/team/${teamMember.id}`)}
            >
              <Wallet className="h-4 w-4" />
              ملفي الوظيفي
            </Button>
          )}
        </CardContent>
      </Card>

      {/* تغيير كلمة المرور */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2.5 text-[15px] font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gold/10">
              <KeyRound className="h-[18px] w-[18px] text-gold" />
            </span>
            تغيير كلمة المرور
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="acc_pw">كلمة المرور الجديدة</Label>
              <Input
                id="acc_pw"
                dir="ltr"
                type="password"
                autoComplete="new-password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="acc_pw2">تأكيد كلمة المرور</Label>
              <Input
                id="acc_pw2"
                dir="ltr"
                type="password"
                autoComplete="new-password"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
              />
            </div>
          </div>
          {error && <p className="text-xs font-medium text-destructive">{error}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="gold"
              onClick={changePassword}
              disabled={saving || !pw || !pw2}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <BadgeCheck className="h-4 w-4" />
              )}
              تغيير كلمة المرور
            </Button>
            <p className="text-xs text-muted-foreground">
              8 أحرف على الأقل — ومن يدخل برمز الجوال يمكنه تعيينها هنا لتفعيل
              الدخول بكلمة المرور.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
