import { Button } from './Button'
import type { UnsavedGuard } from './unsavedGuard'

/** The leave guard's question, for a pane whose form does not draw it itself. */
export function UnsavedAsk({ guard }: { guard: UnsavedGuard }) {
  if (!guard.asking) return null
  return (
    <div role="alert" className="rounded-md border border-rule-strong p-3 text-sm">
      <p className="text-ink">
        {guard.leaving
          ? 'You have unsaved changes. Leaving will discard them.'
          : 'You have unsaved changes. Closing will discard them.'}
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
