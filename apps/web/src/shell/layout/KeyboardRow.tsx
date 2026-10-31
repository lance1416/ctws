import { useEffect, useRef, useState } from 'react'
import {
  type EditorAction,
  type FocusedEditor,
  useFocusedEditor,
} from '../../platform/editor/focused'
import { FORMAT_ICON } from '../../platform/ui/icons'
import { usePhone } from '../../platform/ui/phone'

const BUTTONS: readonly { action: EditorAction; label: string }[] = [
  { action: 'heading', label: 'Heading' },
  { action: 'list', label: 'List' },
  { action: 'task', label: 'Task' },
  { action: 'mention', label: 'Mention' },
  { action: 'link', label: 'Link' },
]

/** The row's own height, `h-12`. */
const ROW_PX = 48

/** Less than this between the window and what shows of it is a browser bar, not a keyboard. */
const KEYBOARD_PX = 120

/**
 * Where the row's foot goes with a keyboard up: the foot of what shows of the page. On Safari
 * that is the top of its own floating address bar, over its bar of up, down and Done; nothing of
 * the page can go lower. Null with no keyboard.
 */
function useKeyboardFoot(): number | null {
  const [foot, setFoot] = useState<number | null>(null)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const measure = () =>
      setFoot(window.innerHeight - vv.height > KEYBOARD_PX ? vv.offsetTop + vv.height : null)
    measure()
    vv.addEventListener('resize', measure)
    vv.addEventListener('scroll', measure)
    return () => {
      vv.removeEventListener('resize', measure)
      vv.removeEventListener('scroll', measure)
    }
  }, [])
  return foot
}

/**
 * The editor the row writes in: the one with the focus, held a moment after it lets go, so a
 * press that took the focus with it still lands where it was meant.
 */
function useRowEditor(): FocusedEditor | null {
  const focused = useFocusedEditor()
  const [held, setHeld] = useState<FocusedEditor | null>(focused)
  useEffect(() => {
    if (focused) return setHeld(focused)
    const t = setTimeout(() => setHeld(null), 300)
    return () => clearTimeout(t)
  }, [focused])
  return focused ?? held
}

/**
 * One of the row's buttons. A touch acts as it lands and is kept from the page: on iOS that is the
 * one way the editor keeps the focus and the keyboard stays up, as React listens to touches
 * passively and could not stop them (BUG-101). A mouse's press is kept from the focus the same way
 * and acts on its click.
 */
function RowButton({
  action,
  label,
  editor,
}: {
  action: EditorAction
  label: string
  editor: FocusedEditor
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const latest = useRef(editor)
  latest.current = editor
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const touch = (e: TouchEvent) => {
      e.preventDefault()
      latest.current.act(action)
    }
    el.addEventListener('touchstart', touch, { passive: false })
    return () => el.removeEventListener('touchstart', touch)
  }, [action])
  const Icon = FORMAT_ICON[action]
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => editor.act(action)}
      className="grid size-11 place-items-center rounded-control text-ink active:bg-hover"
    >
      <Icon size={20} aria-hidden="true" />
    </button>
  )
}

/**
 * THE PHONE'S ROW OVER THE KEYBOARD (REQ-002 FR-113, artboard 35): what is hard to type there, a
 * heading, a list, a task, `@`, a link, and undo on the right; on top of Safari's own bar, which
 * keeps its Done to put the keyboard away. Drawn while an editor has the focus.
 */
export function KeyboardRow() {
  const phone = usePhone()
  const editor = useRowEditor()
  const foot = useKeyboardFoot()
  if (!phone || !editor) return null
  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      // On the keyboard's bar; with no keyboard (a hardware one), above the tab bar (BottomBar).
      style={
        foot !== null
          ? { top: foot - ROW_PX }
          : { bottom: 'calc(4rem + env(safe-area-inset-bottom))' }
      }
      className="fixed inset-x-0 z-40 flex h-12 items-center border-t border-line bg-chrome px-2"
    >
      {BUTTONS.map((b) => (
        <RowButton key={b.action} action={b.action} label={b.label} editor={editor} />
      ))}
      <span className="flex-1" />
      <RowButton action="undo" label="Undo" editor={editor} />
      {/* Safari's own floating bar (the address) sits between what shows of the page and the
          keyboard, and no page can put anything under it. The row stops above it; its ground runs
          on down to the foot of the screen, so no text shows through the gap or through the
          keyboard, which is itself see-through (BUG-100). */}
      {foot !== null && (
        <span aria-hidden="true" className="absolute inset-x-0 top-full h-screen bg-chrome" />
      )}
    </div>
  )
}
