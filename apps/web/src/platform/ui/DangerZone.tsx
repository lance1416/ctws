import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { DeleteConfirm } from './DeleteConfirm'

/**
 * Where a thing is destroyed from: last on its surface, under a rule, in red, and it always asks.
 */
export function DangerZone({ children }: { children: ReactNode }) {
  return (
    // `mt-auto`, not `sticky`: in a flex column it drops to the floor of a short surface and
    // follows the last line of a long one. `pt-6` is the minimum gap once the margin collapses.
    <div data-stop-zone className="mt-auto pt-6">
      <div className="border-t border-line py-3">{children}</div>
    </div>
  )
}

/** The trigger and its question in one place: pressing it replaces it with the question. */
export function DangerAction({
  label,
  message,
  confirmLabel,
  busy = false,
  onAsk,
  onConfirm,
  confirm,
  back,
  children,
}: {
  label: string
  /** The question, naming what goes. Null while it is still being counted. */
  message: string | null
  /** The accessible name of the confirm button, e.g. “Confirm deleting this task”. */
  confirmLabel: string
  busy?: boolean
  /** Run when the question opens, for a count that is too expensive to fetch on every render. */
  onAsk?: (() => void) | undefined
  onConfirm: () => void
  /** The two answers' words, when the thing is not deleted (`DeleteConfirm`). */
  confirm?: string | undefined
  back?: string | undefined
  /** Asked instead of the plain question, for a thing that needs a scope (a repeating meeting). */
  children?: ((close: () => void) => ReactNode) | undefined
}) {
  const [asking, setAsking] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const returning = useRef(false)

  const close = () => {
    returning.current = true
    setAsking(false)
  }

  useLayoutEffect(() => {
    // Backing out puts the keyboard back on the control that asked, not on <body>.
    if (!asking) {
      if (!returning.current) return
      returning.current = false
      trigger.current?.focus()
      return
    }
    // A custom question that focuses nothing leaves focus on the box: the trigger has left the DOM
    // and Escape needs somewhere to land.
    const el = box.current
    if (el && !el.contains(document.activeElement)) el.focus()
  }, [asking])

  // Escape cancels; `preventDefault` keeps an enclosing pane open.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!asking || e.key !== 'Escape') return
    e.preventDefault()
    close()
  }

  return (
    <div ref={box} tabIndex={-1} onKeyDown={onKeyDown} className="focus:outline-none">
      {!asking ? (
        <button
          ref={trigger}
          type="button"
          onClick={() => {
            onAsk?.()
            setAsking(true)
          }}
          className="-ml-2.5 h-9 rounded-control px-2.5 text-ui text-stop-t hover:bg-stop/10"
        >
          {label}
        </button>
      ) : children ? (
        children(close)
      ) : (
        <DeleteConfirm
          label={confirmLabel}
          message={message ?? `${label}…`}
          busy={busy || message === null}
          onConfirm={onConfirm}
          onCancel={close}
          confirm={confirm}
          back={back}
        />
      )}
    </div>
  )
}
