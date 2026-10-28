import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BUTTON, ICON_BUTTON } from '../../platform/ui/buttonStyles'
import { CloseIcon, MovedIcon } from '../../platform/ui/icons'
import { useMe } from '../auth/useMe'

const key = (userId: string) => `ctws.moved-prompt.${userId}`

const dismissed = (userId: string) => {
  try {
    return localStorage.getItem(key(userId)) === 'closed'
  } catch {
    return false
  }
}

/**
 * The prompt after the move to the new layout (FR-099), over the workbench: how many guesses need
 * a look, and Review. Closed, it stays closed here; the report itself is in Account until Done.
 */
export function MovedPrompt() {
  const me = useMe().data
  const [closed, setClosed] = useState(() => (me ? dismissed(me.id) : false))
  if (!me?.migrationReport || closed) return null
  const left = me.migrationReport.pending
  const close = () => {
    try {
      localStorage.setItem(key(me.id), 'closed')
    } catch {
      // Not kept; closed for this visit all the same.
    }
    setClosed(true)
  }
  return (
    <section
      aria-label="We moved your data"
      className="flex items-center gap-3 rounded-block border border-warn bg-panel px-4 py-2.5"
    >
      <MovedIcon size={16} aria-hidden="true" className="shrink-0 text-warn" />
      <p className="min-w-0 flex-1 text-ui text-ink">
        We moved your data to the new layout.{' '}
        {left === 0
          ? 'Every guess has been looked at.'
          : left === 1
            ? '1 thing needs a look.'
            : `${left} things need a look.`}
      </p>
      <Link to="/migration" className={BUTTON.secondary}>
        Review
      </Link>
      <button
        type="button"
        onClick={close}
        aria-label="Close"
        title="Close"
        className={ICON_BUTTON}
      >
        <CloseIcon size={16} aria-hidden="true" />
      </button>
    </section>
  )
}
