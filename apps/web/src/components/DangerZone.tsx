import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { DeleteConfirm } from './DeleteConfirm'

/**
 * THE ONE PLACE A THING IS DESTROYED FROM, and it looks the same everywhere.
 *
 * Three rules, and they are the whole component:
 *
 * 1. **BELOW EVERYTHING, AND NEVER ABOVE THE FLOOR.** It is the last thing on the surface that
 *    owns the thing, under a rule. On a surface shorter than the screen it is pushed down to the
 *    foot of it rather than hanging in the middle of the empty half; on a longer one it comes
 *    after the last line, and you scroll to reach it. Nothing is reached by passing over it, and
 *    nothing ever slides under it -- which is what stops a mis-aimed press.
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
    /*
      `mt-auto`，不是 `sticky`。在一个纵向 flex 的面里（页面的 main、详情面板），自动外边距吃掉
      剩下的空，短的面上它就落到底；长的面上没有剩的空，它就排在最后一行后面。`sticky` 那一版
      在长面上浮在正文上面、正文从它底下滚过去，还得给自己涂一层底色去盖住 —— 而那层底色和它
      所在的面不是同一个颜色。

      两层是因为自动外边距在内容够长时会塌成 0：外层的 `pt-6` 是它和正文之间至少留的那段距离。
      没有底色：它属于它所在的面，那条线已经说明它不是正文。
    */
    <div data-danger-zone className="mt-auto pt-6">
      <div className="border-t border-rule py-3">{children}</div>
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
  confirm,
  back,
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
          confirm={confirm}
          back={back}
        />
      )}
    </div>
  )
}
