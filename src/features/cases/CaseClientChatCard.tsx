import { Link } from 'wouter'
import { ChevronLeft, MessageCircle } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Ltr } from '@/components/Ltr'
import { localPhone, requestClientChat, threadName, useMatterClientThreads } from '@/hooks/useClientChats'
import { fmtDate } from '@/lib/format'

/**
 * «محادثة الموكّل» — آخر ما دار مع عميل الملف على الواتساب، للاطلاع (2026-10-06).
 * الرد من صندوق «العملاء» وحده: ما يُكتب هناك يصل للعميل، وما في الملف ونقاشه يبقى للفريق.
 * تختفي إن لم تُربط بالملف محادثة.
 */
export function CaseClientChatCard({ caseId }: { caseId: string }) {
  const { data } = useMatterClientThreads(caseId)
  if (!data?.length) return null
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0 pb-3">
        <MessageCircle className="h-4 w-4 text-emerald-600" />
        <CardTitle className="text-base">محادثة الموكّل</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.map((t) => (
          <Link
            key={t.phone_e164}
            href="/clients"
            onClick={() => requestClientChat(t.phone_e164)}
            className="block rounded-xl border border-emerald-600/20 bg-emerald-600/5 px-3 py-2 transition-colors hover:bg-emerald-600/10"
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              {threadName(t)}
              <span className="text-[11px] font-normal text-muted-foreground">
                <Ltr>{localPhone(t.phone_e164)}</Ltr>
              </span>
              <ChevronLeft className="ms-auto h-4 w-4 text-muted-foreground" />
            </span>
            <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
              {t.last_direction === 'out' ? 'نحن: ' : ''}
              {t.last_preview}
            </span>
            {t.last_message_at && (
              <span className="mt-1 block text-[10px] text-muted-foreground">
                <Ltr>{fmtDate(t.last_message_at)}</Ltr>
              </span>
            )}
          </Link>
        ))}
      </CardContent>
    </Card>
  )
}
