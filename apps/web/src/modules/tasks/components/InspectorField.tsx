import type { ReactNode } from 'react'

/** The inspector's field rows: an icon, a name, then the value (artboard 8), in one grid. */
export const FIELDS = 'grid grid-cols-[16px_76px_minmax(0,1fr)] items-center gap-x-2.5'

/**
 * One field, a line of its own, read or edited in place. `top` holds the icon and name to the
 * first line of a value that runs to several (a list, a row of choices).
 */
export function Field({
  icon,
  name,
  top = false,
  children,
}: {
  icon: ReactNode
  name: string
  top?: boolean
  children: ReactNode
}) {
  const align = top ? 'self-start pt-2' : ''
  return (
    <>
      <span aria-hidden="true" className={`flex text-muted ${align}`}>
        {icon}
      </span>
      <dt className={`text-ui text-muted ${top ? 'self-start pt-1.5' : ''}`}>{name}</dt>
      <dd className="flex min-h-8 min-w-0 items-center">{children}</dd>
    </>
  )
}
