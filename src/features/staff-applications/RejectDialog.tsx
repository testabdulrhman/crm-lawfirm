import { useState } from 'react'
import { Loader2 } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/stores/auth'
import { useRejectApplication } from '@/hooks/useStaffApplications'
import type { StaffApplication } from '@/types/db'

export function RejectDialog({
  application,
  open,
  onOpenChange,
}: {
  application: StaffApplication
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const { teamMember } = useAuth()
  const rejectM = useRejectApplication()
  const [reason, setReason] = useState('')
  const [sendSms, setSendSms] = useState(true)

  const hasPhone = !!application.phone

  const submit = () => {
    rejectM.mutate(
      {
        application,
        reason: reason.trim(),
        reviewerName: teamMember?.name ?? null,
        sendSms: sendSms && hasPhone,
      },
      {
        onSuccess: () => {
          setReason('')
          onOpenChange(false)
        },
      }
    )
  }

  return (
    // أثناء الرفض (تحديث الحالة + SMS اعتذار) لا يُغلق الحوار حتى الانتهاء
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!rejectM.isPending) onOpenChange(o)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>رفض الطلب</DialogTitle>
        </DialogHeader>
        <div className="my-3 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="reject_reason">سبب الرفض *</Label>
            <Textarea
              id="reject_reason"
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="اذكر سبب رفض طلب التوظيف (داخلي — لا يُرسل للمتقدّم)"
            />
          </div>

          <label
            className={
              'flex items-center gap-2 text-sm ' +
              (hasPhone ? '' : 'opacity-50')
            }
          >
            <input
              type="checkbox"
              className="h-4 w-4 accent-gold"
              checked={sendSms && hasPhone}
              disabled={!hasPhone}
              onChange={(e) => setSendSms(e.target.checked)}
            />
            إرسال رسالة اعتذار للمتقدّم عبر SMS
            {!hasPhone && (
              <span className="text-xs text-muted-foreground">
                (لا يوجد رقم جوال)
              </span>
            )}
          </label>
        </div>
        <DialogFooter className="gap-2">
          <Button
            variant="destructive"
            disabled={rejectM.isPending || reason.trim() === ''}
            onClick={submit}
          >
            {rejectM.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            تأكيد الرفض
          </Button>
          <Button
            variant="outline"
            disabled={rejectM.isPending}
            onClick={() => onOpenChange(false)}
          >
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
