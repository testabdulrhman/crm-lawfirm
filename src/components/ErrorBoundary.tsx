// حدّ الخطأ الأعلى — قبله كان أي استثناء عرض = شاشة بيضاء دائمة داخل
// Capacitor على الآيفون بلا مخرج إلا قتل التطبيق (فجوة التدقيق الأخطر).
import { Component, type ReactNode } from 'react'
import { AlertTriangle, RotateCw } from 'lucide-react'

import { Button } from '@/components/ui/button'

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error) {
    // تسجيل للمطوّر — لا يُعرض للمستخدم إلا الملخّص
    console.error('ErrorBoundary:', error)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div
        dir="rtl"
        className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center"
      >
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="h-7 w-7 text-destructive" />
        </div>
        <h1 className="text-lg font-bold text-foreground">حدث خطأ غير متوقع</h1>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          نعتذر — أعد تحميل التطبيق للمتابعة. إن تكرر الخطأ أبلغ المدير بما كنت
          تفعله قبله.
        </p>
        <p className="mt-2 max-w-sm break-words text-xs text-muted-foreground/70">
          {this.state.error.message}
        </p>
        <Button
          variant="gold"
          className="mt-5"
          onClick={() => window.location.reload()}
        >
          <RotateCw className="h-4 w-4" />
          إعادة تحميل التطبيق
        </Button>
      </div>
    )
  }
}
