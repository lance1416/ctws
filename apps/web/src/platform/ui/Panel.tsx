import type { ReactNode } from 'react'
import { HANG } from './hang'

/** A panel's one quiet empty line. `hang` puts it on the titles' edge. */
export function PanelEmpty({ children, hang = false }: { children: ReactNode; hang?: boolean }) {
  return (
    <p
      className={`py-1.5 text-ui text-subtle ${hang ? `${HANG} pl-[calc(3px+var(--spacing)*3.5)]` : 'px-2'}`}
    >
      {children}
    </p>
  )
}
