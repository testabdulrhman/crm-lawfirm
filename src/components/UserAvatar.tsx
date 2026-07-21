import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import type { TeamMember } from '@/types/db'

// أفتار موحّد: صورة الموظف إن وُجدت، وإلا الحرف الأول على خلفية ذهبية
export function UserAvatar({
  member,
  className,
  fallbackClassName,
}: {
  member: Pick<TeamMember, 'name' | 'avatar_initial' | 'avatar_url'> | null
  className?: string
  fallbackClassName?: string
}) {
  return (
    <Avatar className={className}>
      {member?.avatar_url && (
        <AvatarImage src={member.avatar_url} alt={member?.name ?? ''} />
      )}
      <AvatarFallback
        className={cn('bg-gold text-sm font-bold text-navy', fallbackClassName)}
      >
        {member?.avatar_initial || member?.name?.charAt(0) || '؟'}
      </AvatarFallback>
    </Avatar>
  )
}
