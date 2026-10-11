import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
export default function EmptyState({
  Icon,
  title,
  text,
  action,
}: {
  Icon: LucideIcon
  title: string
  text: string
  action?: ReactNode
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon size={26} />
      </span>
      <h2>{title}</h2>
      <p>{text}</p>
      {action}
    </div>
  )
}
