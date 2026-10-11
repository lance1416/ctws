import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { DeleteConfirm } from './DeleteConfirm'

/**
 * THE ONE PLACE A THING IS DESTROYED FROM, and it looks the same everywhere.
 *
 * Three rules, and they are the whole component:
 *
 * 1. **LAST, AND AT THE BOTTOM OF THE SCREEN.** It sits at the end of the surface that owns the
 *    thing and STICKS to the foot of it, so on a short page it is a band along the bottom of the
 *    window rather than a red word hanging in the middle of the empty half. Nothing is reached by
 *    passing over it, which is what stops a mis-aimed press, and the band's own fill plus the
 *    rule above it say that it is not part of the body.
 * 2. **RED.** `danger`, the same token an overdue deadline and a failed save use. An action that
 *    cannot be undone must not wear the colour of the ones that can.
 * 3. **IT ASKS.** Always, and the question names what is lost. The press that destroys is the
 *    SECOND one, and it is never the one your hand was already moving towards.
 *
 * A thing with no page or pane of its own (a reading item) has nowhere to put a zone; its menu
 * carries the same red and the same question instead.
 */
export function DangerZone({ children }: { children: ReactNode }) {
  return (
    <div
      data-danger-zone
      /*
        `sticky bottom-0` 而不是 `fixed`：它仍然属于这个面，跟着这个面滚；短页面上它停在视口底，
        长页面上滚到底才是它的真位置。`-mx-*`/`px-*` 把这条带子撑到面的边 —— 一条只有文字宽的
        分界线不是分界。
      */
      className="sticky bottom-0 z-10 mt-auto border-t border-border-subtle bg-surface py-3"
    >
      {children}
    </div>
  )
}

/**
 * The trigger and its question, which are one control: pressing it replaces it with the question,
 * in place, so the answer is where the hand already is.
 */
export function DangerAction({
  label,
  message,
  confirmLabel,
  busy = false,
  onAsk,
  onConfirm,
  children,
}: {
  /** The button's words, e.g. “Delete task”. */
  label: string
  /** The question, naming what goes. Null while it is still being counted. */
  message: string | null
  /** The accessible name of the confirm button, e.g. “Confirm deleting this task”. */
  confirmLabel: string
  busy?: boolean
  /** Run when the question opens, for a count that is too expensive to fetch on every render. */
  onAsk?: (() => void) | undefined
  onConfirm: () => void
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
    // The question's own button takes focus when it can. While the count is still coming it is
    // disabled and cannot, and the press that opened the question has just left the DOM, so the
    // box takes focus instead -- Escape has to land somewhere.
    const el = box.current
    if (el && !el.contains(document.activeElement)) el.focus()
  }, [asking])

  /**
   * ESCAPE IS ALSO "NO". `preventDefault` says the press was spent here, so a pane this sits in
   * reads it as handled and stays open -- the rule `DetailPane` states for every inner layer.
   */
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
          // The padding is the hover target; the negative margin takes it back out of the layout,
          // so the words line up with the content above them instead of sitting 10px in from it.
          className="-ml-2.5 h-9 rounded-lg px-2.5 text-sm text-danger hover:bg-danger/10"
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
        />
      )}
    </div>
  )
}
