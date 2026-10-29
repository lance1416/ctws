import { useRef } from 'react'
import { BottomSheet } from './BottomSheet'
import { usePhone } from './phone'
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
  const phone = usePhone()
  const cancel = useRef<HTMLButtonElement>(null)
  // On a phone the question rises from the foot, its answers across it, the one that acts first
  // (DES-001 "会议页、机构页…"): the thumb finds them, and Cancel is never the one under it.
  if (phone)
    return (
      <BottomSheet title={label} onClose={onCancel} initialFocus={cancel} head={false}>
        <div role="alertdialog" aria-label={label} className="flex flex-col gap-4 px-4 pt-2 pb-4">
          <p className="text-prose text-ink">{message}</p>
          <div className="flex flex-col gap-2">
            <Button
              look="destructive"
              disabled={busy}
              onClick={onConfirm}
              className="min-h-12 w-full justify-center"
            >
              {confirm}
            </Button>
            <Button
              ref={cancel}
              look="secondary"
              onClick={onCancel}
              className="min-h-12 w-full justify-center"
            >
              {back}
            </Button>
          </div>
        </div>
      </BottomSheet>
    )
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
