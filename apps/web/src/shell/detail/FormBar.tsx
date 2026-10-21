import { useOnline } from '../../platform/http/online'
import { Button } from '../../platform/ui/Button'
import { AlertIcon, OfflineIcon, RetryIcon } from '../../platform/ui/icons'
import { BUTTON } from '../../platform/ui/buttonStyles'

/**
 * "Editing", Cancel and Save, at the top of a form; under it, what stands in the way of saving
 * (FR-032, FR-033): a save that failed keeps what was typed and offers to try again; offline, the
 * button waits and says so. Nothing typed is ever thrown away.
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
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="flex-1 text-meta text-muted">Editing</span>
        <Button look="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button look="primary" type="submit" disabled={busy || disabled || !online}>
          Save
        </Button>
      </div>
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
    </div>
  )
}
