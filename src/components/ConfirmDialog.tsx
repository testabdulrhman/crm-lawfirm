// تأكيد موحّد للإجراءات الإتلافية — التدقيق وجد حذفاً بنقرة واحدة بلا تأكيد
// في ٦ مواضع، والسبب غياب أداة جاهزة لا قرار واعٍ. كل حذف/إيقاف يمرّ من هنا.
import { useState, useCallback } from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface ConfirmOptions {
  title: string
  description?: string
  confirmLabel?: string
  /** true = زر أحمر (الافتراضي للإتلافي) */
  destructive?: boolean
  onConfirm: () => void
}

/**
 * هوك تأكيد: `const { confirm, dialog } = useConfirm()` ثم ضع {dialog} في
 * الشجرة ونادِ confirm({...}) بدل تنفيذ الإجراء مباشرة.
 */
export function useConfirm() {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null)

  const confirm = useCallback((o: ConfirmOptions) => setOpts(o), [])

  const dialog = (
    <AlertDialog open={!!opts} onOpenChange={(o) => !o && setOpts(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{opts?.title}</AlertDialogTitle>
          {opts?.description && (
            <AlertDialogDescription>{opts.description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>إلغاء</AlertDialogCancel>
          <AlertDialogAction
            className={
              opts?.destructive !== false
                ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                : undefined
            }
            onClick={() => {
              opts?.onConfirm()
              setOpts(null)
            }}
          >
            {opts?.confirmLabel ?? 'حذف'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  return { confirm, dialog }
}
