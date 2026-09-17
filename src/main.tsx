import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'

import App from './App'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { queryClient } from '@/lib/queryClient'
import { Toaster } from '@/components/ui/toaster'
import { logError } from '@/lib/errorLog'
import { errMessage } from '@/lib/errors'
import { installStaleBuildRecovery, isChunkLoadError, reloadForNewBuild } from '@/lib/staleBuild'
import './index.css'

// نسخة جديدة نُشرت والصفحة مفتوحة: الجزء المحذوف يُستعاد بإعادة التحميل لا بشاشة خطأ
installStaleBuildRecovery()

// ما أفلت من كل التقاط يُسجَّل أيضاً (logError يتجاهل المعاينة المحلية وضجيج المتصفح)
window.addEventListener('error', (e) => {
  if (isChunkLoadError(e.message) && reloadForNewBuild()) return
  logError('unhandled', e.message, {
    source: e.filename ? `${e.filename}:${e.lineno}` : null,
    stack: e.error instanceof Error ? e.error.stack : null,
  })
})
window.addEventListener('unhandledrejection', (e) => {
  if (isChunkLoadError(e.reason) && reloadForNewBuild()) return
  logError('unhandled', errMessage(e.reason), {
    stack: e.reason instanceof Error ? e.reason.stack : null,
  })
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
      <Toaster />
    </QueryClientProvider>
  </React.StrictMode>
)
