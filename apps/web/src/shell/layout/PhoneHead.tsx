import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BackIcon } from '../../platform/ui/icons'

/**
 * A phone page's title bar. Not drawn from 1024 up, where the top bar and the page's own head say
 * the same.
 */
export function PhoneHead({
  title,
  back,
  actions,
  children,
}: {
  title: ReactNode
  back?: { to: string; label: string }
  actions?: ReactNode
  children?: ReactNode
}) {
  return (
    <header className="flex flex-col gap-1 pb-1 lg:hidden">
      {back && (
        <Link
          to={back.to}
          className="-ml-1 flex min-h-11 items-center gap-1 self-start text-prose text-task-t"
        >
          <BackIcon size={20} aria-hidden="true" />
          {back.label}
        </Link>
      )}
      <div className="flex min-h-11 items-center gap-1">
        <h1
          tabIndex={-1}
          className="min-w-0 flex-1 truncate text-title text-ink focus:outline-none"
        >
          {title}
        </h1>
        {actions}
      </div>
      {children}
    </header>
  )
}
