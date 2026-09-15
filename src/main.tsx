import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'

import App from './App'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { queryClient } from '@/lib/queryClient'
import { Toaster } from '@/components/ui/toaster'
import { logError } from '@/lib/errorLog'
import { errMessage } from '@/lib/errors'
import './index.css'

// ما أفلت من كل التقاط يُسجَّل أيضاً (logError يتجاهل المعاينة المحلية وضجيج المتصفح)
window.addEventListener('error', (e) =>
  logError('unhandled', e.message, {
    source: e.filename ? `${e.filename}:${e.lineno}` : null,
    stack: e.error instanceof Error ? e.error.stack : null,
  })
)
window.addEventListener('unhandledrejection', (e) =>
  logError('unhandled', errMessage(e.reason), {
    stack: e.reason instanceof Error ? e.reason.stack : null,
  })
)

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
