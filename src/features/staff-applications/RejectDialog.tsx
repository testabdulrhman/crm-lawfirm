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

export function RejectDialog({
  applicationId,
  open,
  onOpenChange,
}: {
  applicationId: string
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const { teamMember } = useAuth()
  const rejectM = useRejectApplication()
  const [reason, setReason] = useState('')

  const submit = () => {
    rejectM.mutate(
      {
        id: applicationId,
        reason: reason.trim(),
        reviewerName: teamMember?.name ?? null,
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>رفض الطلب</DialogTitle>
        </DialogHeader>
        <div className="my-3 space-y-1.5">
          <Label htmlFor="reject_reason">سبب الرفض *</Label>
          <Textarea
            id="reject_reason"
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="اذكر سبب رفض طلب التوظيف"
          />
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
