import { useEffect, useState } from 'react'
import { type EditorAction, useFocusedEditor } from '../../platform/editor/focused'
import { FORMAT_ICON } from '../../platform/ui/icons'
import { usePhone } from '../../platform/ui/phone'

const BUTTONS: readonly { action: EditorAction; label: string }[] = [
  { action: 'heading', label: 'Heading' },
  { action: 'list', label: 'List' },
  { action: 'task', label: 'Task' },
  { action: 'mention', label: 'Mention' },
  { action: 'link', label: 'Link' },
]

/**
 * How far up from the window's foot the keyboard reaches, Safari's own bar (up, down, Done)
 * included: the visible viewport's foot, where our row sits.
 */
function useKeyboardTop(): number {
  const [above, setAbove] = useState(0)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const measure = () => setAbove(Math.max(0, window.innerHeight - vv.height - vv.offsetTop))
    measure()
    vv.addEventListener('resize', measure)
    vv.addEventListener('scroll', measure)
    return () => {
      vv.removeEventListener('resize', measure)
      vv.removeEventListener('scroll', measure)
    }
  }, [])
  return above
}

/**
 * THE PHONE'S ROW OVER THE KEYBOARD (REQ-002 FR-113, artboard 35): what is hard to type there, a
 * heading, a list, a task, `@`, a link, and undo on the right; on top of Safari's own bar, which
 * keeps its Done to put the keyboard away. Drawn while an editor has the focus. A press keeps the
 * focus where it is, so the keyboard stays up.
 */
export function KeyboardRow() {
  const phone = usePhone()
  const editor = useFocusedEditor()
  const above = useKeyboardTop()
  if (!phone || !editor) return null
  const button = (action: EditorAction, label: string) => {
    const Icon = FORMAT_ICON[action]
    return (
      <button
        key={action}
        type="button"
        aria-label={label}
        // Not the editor's focus: a press here would put the keyboard away.
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => editor.act(action)}
        className="grid size-11 place-items-center rounded-control text-ink active:bg-hover"
      >
        <Icon size={20} aria-hidden="true" />
      </button>
    )
  }
  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      // No keyboard up (a hardware one): above the tab bar, which is then on screen (BottomBar).
      style={{ bottom: above > 0 ? above : 'calc(4rem + env(safe-area-inset-bottom))' }}
      className="fixed inset-x-0 z-40 flex h-12 items-center border-t border-line bg-chrome px-2"
    >
      {BUTTONS.map((b) => button(b.action, b.label))}
      <span className="flex-1" />
      {button('undo', 'Undo')}
    </div>
  )
}
