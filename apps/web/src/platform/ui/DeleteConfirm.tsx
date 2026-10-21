import { useRef } from 'react'
import { Button } from './Button'
import { Modal } from './Modal'

/**
 * THE ONE QUESTION BEFORE DESTROYING (FR-035, handoff §7): a small dialog on the float, whose
 * title says what goes and what stays. Cancel takes focus, so a held or repeated Enter backs out
 * instead of destroying; Esc closes.
 */
export function DeleteConfirm({
  label,
  message,
  busy,
  onConfirm,
  onCancel,
  confirm = 'Delete',
  back = 'Cancel',
}: {
  /** The accessible name of the dialog. */
  label: string
  /** The question, naming the thing: "Delete Mira Chen? Her contact details … stay." */
  message: string
  /** True until the owner can say what is lost, and while the delete is in flight. */
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
  /** The destroying button's words, naming the thing: "Delete Stripe", "Cancel meeting". */
  confirm?: string | undefined
  /** The way out's word. "Cancel" beside "Cancel meeting" would mean its opposite. */
  back?: string | undefined
}) {
  const cancel = useRef<HTMLButtonElement>(null)
  return (
    <Modal title={label} onClose={onCancel} initialFocus={cancel} palette narrow>
      <div role="alertdialog" aria-label={label} className="flex flex-col gap-4 px-5 py-5">
        <p className="text-prose text-ink">{message}</p>
        <div className="flex items-center justify-end gap-2">
          <Button ref={cancel} look="secondary" onClick={onCancel}>
            {back}
          </Button>
          <Button look="destructive" disabled={busy} onClick={onConfirm}>
            {confirm}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
