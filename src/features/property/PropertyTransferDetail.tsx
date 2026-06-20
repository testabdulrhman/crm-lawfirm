import { useState } from 'react'
import { useLocation, Link } from 'wouter'
import {
  ArrowRight,
  Pencil,
  Trash2,
  Phone,
  BookUser,
  Home,
  User,
  UserCheck,
  Coins,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertTitle } from '@/components/ui/alert'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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

import { fmtDatePref, fmtNumber, fmtCurrency } from '@/lib/format'
import { openExternal } from '@/lib/external'
import { useAuth } from '@/stores/auth'
import { useIsDirector } from '@/hooks/useIsDirector'
import {
  usePropertyTransfer,
  useUpdatePropertyTransferStatus,
  useDeletePropertyTransfer,
} from '@/hooks/usePropertyTransfers'
import { PropertyTransferForm } from './PropertyTransferForm'
import {
  PROPERTY_STATUS_OPTIONS,
  propertyStatusBadge,
  propertyStatusLabel,
} from '@/lib/propertyLabels'

export function PropertyTransferDetail({ id }: { id: string }) {
  const [, navigate] = useLocation()
  const { teamMember } = useAuth()
  const isDirector = useIsDirector()
  const { data: p, isLoading, isError } = usePropertyTransfer(id)
  const statusM = useUpdatePropertyTransferStatus()
  const deleteM = useDeletePropertyTransfer()

  const [editOpen, setEditOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (isError || !p) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate('/property')}>
          <ArrowRight className="h-4 w-4" />
          رجوع
        </Button>
        <Alert variant="destructive">
          <AlertTitle>تعذّر تحميل المعاملة</AlertTitle>
        </Alert>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" onClick={() => navigate('/property')}>
          <ArrowRight className="h-4 w-4" />
          رجوع للتوثيق العقاري
        </Button>
        {isDirector && (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="h-4 w-4" />
            حذف
          </Button>
        )}
      </div>

      {/* الرأس */}
      <Card>
        <CardContent className="flex flex-wrap items-start justify-between gap-3 p-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Home className="h-5 w-5 shrink-0 text-gold" />
              <h2 className="text-xl font-bold text-foreground">
                {p.transfer_type || 'معاملة عقارية'}
              </h2>
            </div>
            <div className="mt-1.5 flex items-center gap-1.5">
              <Badge variant={propertyStatusBadge(p.status)}>
                {propertyStatusLabel(p.status)}
              </Badge>
              {p.transfer_date && (
                <span className="text-xs text-muted-foreground">
                  {fmtDatePref(p.transfer_date)}
                </span>
              )}
            </div>
          </div>
          <Select
            value={p.status ?? 'قيد التنفيذ'}
            onValueChange={(v) => statusM.mutate({ id: p.id, status: v })}
          >
            <SelectTrigger className="h-9 w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROPERTY_STATUS_OPTIONS.map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {/* البائع */}
        <PartyCard
          icon={User}
          title="البائع"
          name={p.seller_name}
          idNum={p.seller_id_num}
          phone={p.seller_phone}
          contactId={p.seller_id}
        />
        {/* المشتري */}
        <PartyCard
          icon={UserCheck}
          title="المشتري"
          name={p.buyer_name}
          idNum={p.buyer_id_num}
          phone={p.buyer_phone}
          contactId={p.buyer_id}
        />
      </div>

      {/* العقار */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">العقار</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            <Row label="نوع العقار" value={p.property_type} />
            <Row label="رقم الصك" value={p.deed_number} dir="ltr" />
            <Row
              label="المساحة"
              value={p.area != null ? `${fmtNumber(p.area)} م²` : null}
            />
            <Row label="الموقع" value={p.location} />
            <Row label="ملاحظات العقار" value={p.property_notes} full />
          </dl>
        </CardContent>
      </Card>

      {/* المالية */}
      {(p.amount != null || p.amount_text) && (
        <Card>
          <CardHeader className="flex-row items-center gap-2 space-y-0">
            <Coins className="h-4 w-4 text-gold" />
            <CardTitle className="text-base">المالية</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              <Row
                label="المبلغ"
                value={p.amount != null ? fmtCurrency(p.amount) : null}
              />
              <Row label="المبلغ كتابةً" value={p.amount_text} />
            </dl>
          </CardContent>
        </Card>
      )}

      {/* عام */}
      {(p.notes || p.created_by) && (
        <Card>
          <CardContent className="space-y-2 pt-6">
            {p.notes && (
              <p className="whitespace-pre-wrap text-sm text-foreground">{p.notes}</p>
            )}
            {p.created_by && (
              <p className="text-xs text-muted-foreground">
                أنشأها: {p.created_by}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
          <Pencil className="h-4 w-4" />
          تعديل
        </Button>
      </div>

      {/* الحوارات */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <PropertyTransferForm transfer={p} onDone={() => setEditOpen(false)} />
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد حذف المعاملة</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف هذه المعاملة العقارية. يمكن استرجاعها لاحقاً من قِبل المدير.
              هل أنت متأكد؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                deleteM.mutate(
                  { id: p.id, deletedBy: teamMember?.name ?? null },
                  { onSuccess: () => navigate('/property') }
                )
              }
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function PartyCard({
  icon: Icon,
  title,
  name,
  idNum,
  phone,
  contactId,
}: {
  icon: typeof User
  title: string
  name: string | null
  idNum: string | null
  phone: string | null
  contactId: string | null
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <Icon className="h-4 w-4 text-gold" />
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="font-medium text-foreground">{name || '—'}</p>
        {idNum && (
          <p dir="ltr" className="text-right text-xs text-muted-foreground">
            هوية: {idNum}
          </p>
        )}
        {phone && (
          <button
            dir="ltr"
            className="flex items-center justify-end gap-1 text-sm text-muted-foreground hover:text-gold"
            onClick={() => openExternal(`tel:${phone}`)}
          >
            <span>{phone}</span>
            <Phone className="h-3.5 w-3.5" />
          </button>
        )}
        {contactId && (
          <Link
            href={`/contacts/${contactId}`}
            className="inline-flex items-center gap-1 text-sm text-gold hover:underline"
          >
            <BookUser className="h-3.5 w-3.5" />
            ملف جهة الاتصال
          </Link>
        )}
      </CardContent>
    </Card>
  )
}

function Row({
  label,
  value,
  dir,
  full,
}: {
  label: string
  value: string | null | undefined
  dir?: 'ltr' | 'rtl'
  full?: boolean
}) {
  if (!value || value.trim() === '') return null
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        dir={dir}
        className={
          'mt-0.5 whitespace-pre-wrap text-sm text-foreground ' +
          (dir === 'ltr' ? 'text-right' : '')
        }
      >
        {value}
      </dd>
    </div>
  )
}
