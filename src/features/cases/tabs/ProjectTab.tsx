// تبويب «بطاقة المشروع» — الطبقة الإدارية للقضية وفق إطار إدارة المشاريع القانونية:
// الغاية، نطاق العمل وما لا يشمله، المخرجات المتفق عليها، الافتراضات.
// (المشروع القانوني إطار تنظيم العمل، والملف القضائي وعاء الوثائق)
import { useEffect, useState } from 'react'
import {
  Target,
  Briefcase,
  ListChecks,
  PackageCheck,
  CircleSlash,
  Lightbulb,
  Loader2,
  Save,
  type LucideIcon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { fmtDateTime } from '@/lib/format'
import { useAuth } from '@/stores/auth'
import {
  useCaseProject,
  useSaveCaseProject,
  type CaseProjectInput,
} from '@/hooks/useCaseProject'

const FIELDS: {
  key: keyof CaseProjectInput
  label: string
  hint: string
  icon: LucideIcon
  rows: number
}[] = [
  {
    key: 'goal',
    label: 'الغاية من المشروع',
    hint: 'ما النتيجة النهائية التي يسعى إليها الموكّل؟',
    icon: Target,
    rows: 2,
  },
  {
    key: 'scope_in',
    label: 'نطاق العمل — ما يشمله',
    hint: 'الأعمال المتفق على تقديمها ضمن هذا المشروع.',
    icon: ListChecks,
    rows: 4,
  },
  {
    key: 'scope_out',
    label: 'ما لا يشمله النطاق',
    hint: 'ما يقع خارج الاتفاق (يمنع الخلاف لاحقاً).',
    icon: CircleSlash,
    rows: 3,
  },
  {
    key: 'deliverables',
    label: 'المخرجات المتفق عليها',
    hint: 'ما سيُسلَّم فعليّاً للعميل: مذكرات، عقود، أحكام، تقارير…',
    icon: PackageCheck,
    rows: 3,
  },
  {
    key: 'assumptions',
    label: 'الافتراضات',
    hint: 'ما بُني عليه التخطيط ويتغيّر المشروع إن اختلّ.',
    icon: Lightbulb,
    rows: 3,
  },
]

const EMPTY: CaseProjectInput = {
  goal: '',
  scope_in: '',
  scope_out: '',
  deliverables: '',
  assumptions: '',
}

export function ProjectTab({ caseId }: { caseId: string }) {
  const { teamMember } = useAuth()
  const { data, isLoading } = useCaseProject(caseId)
  const saveM = useSaveCaseProject(caseId)

  const [form, setForm] = useState<CaseProjectInput>(EMPTY)
  const [loaded, setLoaded] = useState(false)

  // تعبئة النموذج عند وصول البيانات (مرة واحدة كي لا يُمسح ما يكتبه المستخدم)
  useEffect(() => {
    if (isLoading || loaded) return
    setForm({
      goal: data?.goal ?? '',
      scope_in: data?.scope_in ?? '',
      scope_out: data?.scope_out ?? '',
      deliverables: data?.deliverables ?? '',
      assumptions: data?.assumptions ?? '',
    })
    setLoaded(true)
  }, [data, isLoading, loaded])

  const dirty =
    loaded &&
    FIELDS.some((f) => (form[f.key] ?? '') !== (data?.[f.key] ?? ''))

  const save = () => {
    const clean: CaseProjectInput = {
      goal: form.goal?.trim() || null,
      scope_in: form.scope_in?.trim() || null,
      scope_out: form.scope_out?.trim() || null,
      deliverables: form.deliverables?.trim() || null,
      assumptions: form.assumptions?.trim() || null,
    }
    saveM.mutate({ input: clean, updatedBy: teamMember?.name ?? null })
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gold/10">
              <Briefcase className="h-[18px] w-[18px] text-gold" />
            </span>
            <h3 className="text-[15px] font-semibold text-foreground">
              بطاقة المشروع
            </h3>
          </div>
          <p className="text-sm text-muted-foreground">
            الطبقة الإدارية للقضية: تُوثّق ما اتُّفق عليه مع الموكّل — الغاية
            والنطاق والمخرجات — بمعزل عن المسار الإجرائي (الجلسات والأحكام).
          </p>

          {FIELDS.map((f) => {
            const Icon = f.icon
            return (
              <div key={f.key} className="space-y-1.5 border-t pt-4">
                <Label
                  htmlFor={`proj_${f.key}`}
                  className="flex items-center gap-2"
                >
                  <Icon className="h-4 w-4 text-gold" />
                  {f.label}
                </Label>
                <p className="text-xs text-muted-foreground">{f.hint}</p>
                <Textarea
                  id={`proj_${f.key}`}
                  rows={f.rows}
                  value={form[f.key] ?? ''}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, [f.key]: e.target.value }))
                  }
                />
              </div>
            )
          })}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <p className="text-xs text-muted-foreground">
              {data?.updated_at
                ? `آخر تحديث: ${fmtDateTime(data.updated_at)}${data.updated_by ? ` — ${data.updated_by}` : ''}`
                : 'لم تُحفظ بعد'}
            </p>
            <Button
              variant="gold"
              onClick={save}
              disabled={!dirty || saveM.isPending}
            >
              {saveM.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              حفظ
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
