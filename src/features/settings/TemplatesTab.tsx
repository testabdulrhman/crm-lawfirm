import { useState } from 'react'
import { Loader2, Mail, MessageCircle, MessageSquareText, Save } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/components/EmptyState'
import { QueryErrorState } from '@/components/QueryErrorState'
import {
  useMessageTemplates,
  useUpdateMessageTemplate,
  type MessageTemplate,
} from '@/hooks/useMessageTemplates'

export function TemplatesTab() {
  const { data, isLoading, isError, error, refetch } = useMessageTemplates()

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <QueryErrorState
        title="تعذّر تحميل قوالب الرسائل"
        error={error}
        onRetry={() => refetch()}
      />
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        لكل قالب ثلاثة نصوص بحسب القناة: <b>نصية SMS</b> و<b>واتساب</b> و
        <b>بريد إلكتروني</b>. نص الواتساب أو البريد الفارغ يَستخدم نص النصية
        تلقائياً. المتغيّرات بين أقواس (مثل{' '}
        <code className="text-gold">{'{name}'}</code>) تُستبدل عند الإرسال.
      </p>
      {(data ?? []).length === 0 ? (
        <EmptyState
          icon={MessageSquareText}
          title="لا توجد قوالب رسائل"
          description="تُهيَّأ القوالب مع إعداد النظام وتظهر هنا فور توفّرها — راجع مدير النظام إن لم تظهر."
        />
      ) : (
        (data ?? []).map((t) => <TemplateCard key={t.id} template={t} />)
      )}
    </div>
  )
}

function TemplateCard({ template }: { template: MessageTemplate }) {
  const updateM = useUpdateMessageTemplate()
  const [body, setBody] = useState(template.body ?? '')
  const [bodyWa, setBodyWa] = useState(template.body_whatsapp ?? '')
  const [bodyEmail, setBodyEmail] = useState(template.body_email ?? '')
  const [emailSubject, setEmailSubject] = useState(template.email_subject ?? '')

  const dirty =
    body !== (template.body ?? '') ||
    bodyWa !== (template.body_whatsapp ?? '') ||
    bodyEmail !== (template.body_email ?? '') ||
    emailSubject !== (template.email_subject ?? '')

  const save = () =>
    updateM.mutate({
      id: template.id,
      input: {
        body,
        // الفراغ يُحفظ null ليبقى معناه «يرث نص النصية» واضحاً في القاعدة
        body_whatsapp: bodyWa.trim() ? bodyWa : null,
        body_email: bodyEmail.trim() ? bodyEmail : null,
        email_subject: emailSubject.trim() ? emailSubject : null,
      },
    })

  const inheritNote = (
    <p className="text-xs text-muted-foreground">
      فارغ — تُرسل هذه القناة نصَّ الرسالة النصية كما هو.
    </p>
  )

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
            {dirty && (
              <Badge
                variant="outline"
                className="border-amber-500/50 text-amber-600 dark:text-amber-500"
              >
                غير محفوظ
              </Badge>
            )}
          </div>
          <Button
            size="sm"
            variant="gold"
            disabled={!dirty || updateM.isPending}
            onClick={save}
          >
            {updateM.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            حفظ
          </Button>
        </div>

        <Tabs defaultValue="sms" dir="rtl">
          <TabsList className="h-9">
            <TabsTrigger value="sms" className="gap-1.5 text-xs">
              <MessageSquareText className="h-3.5 w-3.5" />
              نصية SMS
            </TabsTrigger>
            <TabsTrigger value="whatsapp" className="gap-1.5 text-xs">
              <MessageCircle className="h-3.5 w-3.5" />
              واتساب
              {!template.body_whatsapp && (
                <span className="text-muted-foreground/70">(يرث)</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="email" className="gap-1.5 text-xs">
              <Mail className="h-3.5 w-3.5" />
              بريد إلكتروني
              {!template.body_email && (
                <span className="text-muted-foreground/70">(يرث)</span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sms" className="mt-3">
            <Textarea
              rows={5}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="text-sm leading-relaxed"
            />
          </TabsContent>

          <TabsContent value="whatsapp" className="mt-3 space-y-2">
            <Textarea
              rows={5}
              value={bodyWa}
              onChange={(e) => setBodyWa(e.target.value)}
              placeholder={body || undefined}
              className="text-sm leading-relaxed"
            />
            {!bodyWa.trim() && inheritNote}
          </TabsContent>

          <TabsContent value="email" className="mt-3 space-y-2">
            <Input
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
              placeholder={`الموضوع — فارغ يستخدم «${template.name || template.key}»`}
            />
            <Textarea
              rows={7}
              value={bodyEmail}
              onChange={(e) => setBodyEmail(e.target.value)}
              placeholder={body || undefined}
              className="text-sm leading-relaxed"
            />
            {!bodyEmail.trim() && inheritNote}
          </TabsContent>
        </Tabs>

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
