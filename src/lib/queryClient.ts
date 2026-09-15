import { QueryCache, QueryClient } from '@tanstack/react-query'

import { errMessage } from '@/lib/errors'
import { logError } from '@/lib/errorLog'

export const queryClient = new QueryClient({
  // جلبٌ فشل بعد إعادة المحاولة يُسجَّل — يظهر للموظف في صفحته غالباً بلا توست
  queryCache: new QueryCache({
    onError: (error, query) =>
      logError('query', errMessage(error), {
        source: JSON.stringify(query.queryKey).slice(0, 200),
      }),
  }),
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
})
