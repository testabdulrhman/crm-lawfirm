import { useState } from 'react'
import { Loader2, MessageSquareText, Save } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useMessageTemplates,
  useUpdateMessageTemplate,
  type MessageTemplate,
} from '@/hooks/useMessageTemplates'

export function TemplatesTab() {
  const { data, isLoading } = useMessageTemplates()

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        نصوص الرسائل المُرسلة للعملاء والمتقدّمين. عدّل النص واحفظ. المتغيّرات بين
        أقواس (مثل <code className="text-gold">{'{name}'}</code>) تُستبدل تلقائياً
        عند الإرسال.
      </p>
      {(data ?? []).map((t) => (
        <TemplateCard key={t.id} template={t} />
      ))}
    </div>
  )
}

function TemplateCard({ template }: { template: MessageTemplate }) {
  const updateM = useUpdateMessageTemplate()
  const [body, setBody] = useState(template.body ?? '')
  const dirty = body !== (template.body ?? '')

  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MessageSquareText className="h-4 w-4 text-gold" />
            <span className="font-medium text-foreground">
              {template.name || template.key}
            </span>
            {template.key && (
              <Badge variant="outline" className="font-mono text-xs">
                {template.key}
              </Badge>
            )}
          </div>
          <Button
            size="sm"
            variant="gold"
            disabled={!dirty || updateM.isPending}
            onClick={() => updateM.mutate({ id: template.id, body })}
          >
            {updateM.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            حفظ
          </Button>
        </div>

        <Textarea
          rows={5}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="text-sm leading-relaxed"
        />

        {Array.isArray(template.variables) && template.variables.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            المتغيّرات:
            {template.variables.map((v) => (
              <code
                key={v}
                className="rounded bg-muted px-1.5 py-0.5 text-gold"
              >{`{${v}}`}</code>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
