import { Button } from './Button'
import type { UnsavedGuard } from './unsavedGuard'

/** The leave guard's question, for a pane whose form does not draw it itself. */
export function UnsavedAsk({ guard }: { guard: UnsavedGuard }) {
  if (!guard.asking) return null
  return (
    <div role="alert" className="rounded-control border border-line-strong p-3 text-ui">
      <p className="text-ink">
        {guard.leaving
          ? 'You have unsaved changes. Leaving will discard them.'
          : 'Discard the changes?'}
      </p>
      <div className="mt-2 flex gap-2">
        <Button look="secondary" onClick={guard.discard}>
          Discard changes
        </Button>
        <Button look="primary" ref={guard.focusOn} onClick={guard.keep}>
          Keep editing
        </Button>
      </div>
    </div>
  )
}
