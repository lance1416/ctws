import type { ReactNode } from 'react'
import { HANG } from './hang'

/** A page's title. `hang` lines it up with the rows' threads, past the date margin. */
export function PageHead({ hang = false, children }: { hang?: boolean; children: ReactNode }) {
  return (
    <h1
      tabIndex={-1}
      className={`${hang ? `${HANG} ` : ''}text-title tracking-[-0.02em] focus:outline-none`}
    >
      {children}
    </h1>
  )
}
