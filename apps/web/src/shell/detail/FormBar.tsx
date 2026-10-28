import type { KeyboardEvent } from 'react'
import { useOnline } from '../../platform/http/online'
import { keyLabel } from '../../platform/keyboard/keys'
import { Button } from '../../platform/ui/Button'
import { AlertIcon, OfflineIcon, RetryIcon } from '../../platform/ui/icons'
import { BUTTON, KEY_ON_INK } from '../../platform/ui/buttonStyles'

/** Ctrl Enter (⌘ Enter on a Mac) saves a form from any field (FR-029); give it to the form. */
export function saveOnChord(e: KeyboardEvent<HTMLFormElement>) {
  if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey) || e.nativeEvent.isComposing) return
  e.preventDefault()
  e.currentTarget.requestSubmit()
}

/**
 * Cancel and Save, at the foot of a form, Save with its keys (DES-001 section 7); over them, what
 * stands in the way of saving (FR-032, FR-033): a save that failed keeps what was typed and
 * offers to try again; offline, the button waits and says so. Nothing typed is ever thrown away.
 */
export function FormBar({
  busy,
  disabled = false,
  failed = null,
  onCancel,
}: {
  busy: boolean
  disabled?: boolean
  /** The last save's refusal, in the server's words, or true when it just failed. */
  failed?: string | boolean | null
  onCancel: () => void
}) {
  const online = useOnline()
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-4">
      {!online && (
        <p role="status" className="flex items-start gap-2 text-ui text-warn-t">
          <OfflineIcon size={14} aria-hidden="true" className="mt-0.75 shrink-0" />
          You’re offline. This stays here until you can save.
        </p>
      )}
      {online && failed && (
        <div className="flex items-center gap-2">
          <p role="alert" className="flex flex-1 items-start gap-2 text-ui text-stop-t">
            <AlertIcon size={14} aria-hidden="true" className="mt-0.75 shrink-0" />
            <span>
              Couldn’t save. What you typed is still here.
              {typeof failed === 'string' && <span className="block text-muted">{failed}</span>}
            </span>
          </p>
          <button
            type="submit"
            disabled={busy}
            className={`${BUTTON.secondary} h-7 px-2.5 text-meta`}
          >
            <RetryIcon size={14} aria-hidden="true" />
            Try again
          </button>
        </div>
      )}
      <div className="flex items-center justify-end gap-2">
        <Button look="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button look="primary" type="submit" disabled={busy || disabled || !online}>
          Save
          <kbd className={KEY_ON_INK}>{keyLabel('Ctrl Enter')}</kbd>
        </Button>
      </div>
    </div>
  )
}
