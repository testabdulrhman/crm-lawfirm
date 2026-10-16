// تنسيق إجابة «الباحث»: عناوين ونقاط وجداول وروابط — بلا إضافة typography، بأصناف Tailwind مباشرة.
// الروابط تُفتح خارج التطبيق (openExternal) فتعمل في الآيفون كما في المتصفح.
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { openExternal } from '@/lib/external'

export function Markdown({ text }: { text: string }) {
  return (
    <div className="space-y-3 text-[15px] leading-8 text-foreground [overflow-wrap:anywhere]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h3 className="mt-4 text-lg font-bold">{children}</h3>,
          h2: ({ children }) => <h3 className="mt-4 text-base font-bold">{children}</h3>,
          h3: ({ children }) => <h4 className="mt-3 text-[15px] font-semibold">{children}</h4>,
          h4: ({ children }) => <h4 className="mt-3 text-[15px] font-semibold">{children}</h4>,
          p: ({ children }) => <p className="whitespace-pre-wrap">{children}</p>,
          ul: ({ children }) => <ul className="list-disc space-y-1 pr-5 marker:text-gold">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal space-y-1 pr-5 marker:text-muted-foreground">{children}</ol>,
          li: ({ children }) => <li className="pr-1">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
          blockquote: ({ children }) => (
            <blockquote className="border-r-4 border-gold/50 bg-gold/5 py-1 pr-3 text-muted-foreground">{children}</blockquote>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              onClick={(e) => {
                e.preventDefault()
                if (href) openExternal(href)
              }}
              className="text-sky-700 underline decoration-sky-700/40 underline-offset-2 hover:decoration-sky-700 dark:text-sky-400"
            >
              {children}
            </a>
          ),
          code: ({ children }) => (
            <code dir="ltr" className="rounded bg-muted px-1.5 py-0.5 font-mono text-[13px]">{children}</code>
          ),
          pre: ({ children }) => (
            <pre dir="ltr" className="overflow-x-auto rounded-lg bg-muted p-3 text-[13px] leading-6">{children}</pre>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full border-collapse text-sm">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border-b bg-muted/60 px-3 py-2 text-right font-semibold">{children}</th>,
          td: ({ children }) => <td className="border-b border-border/60 px-3 py-2 align-top">{children}</td>,
          hr: () => <hr className="my-4 border-border" />,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
