import type { KeyboardEvent } from 'react'
import { useComposing } from '../keyboard/composition'

type Composing = ReturnType<typeof useComposing>
type Handlers = { onCommit: () => void; onCancel?: () => void }

/**
 * Props for a one-line field: Enter commits unless an IME is composing, Escape cancels. A spent
 * Escape is marked with preventDefault, so a pane or dialog around the field stays open.
 */
export function inlineEditProps(composing: Composing, { onCommit, onCancel }: Handlers) {
  return {
    ...composing.bind,
    onKeyDown: (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !composing.composingNow(e)) onCommit()
      else if (e.key === 'Escape' && onCancel) {
        e.preventDefault()
        onCancel()
      }
    },
  }
}
