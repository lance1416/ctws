import type { PersonResponse } from '@ctws/contracts'
import { useMutation } from '@tanstack/react-query'
import { createPerson } from '../api'
import { useLineEntry } from '../../../platform/ui/useLineEntry'
import { textbox } from '../../../platform/ui/formStyles'

/** Type a name and press Enter; the rest is filled in on the pane that opens. */
export function NewPersonInput({ onCreated }: { onCreated: (person: PersonResponse) => void }) {
  const name = useLineEntry()

  const send = name.sends((text) => createPerson({ name: text }))
  const create = useMutation({
    mutationFn: send,
    meta: { awaits: [['people']], ownsError: true },
    onSuccess: (person) => onCreated(person),
  })

  return (
    <div>
      <input
        {...name.field({ onSubmit: create.mutate, busy: create.isPending })}
        placeholder="Add a name"
        aria-label="Add a name"
        className={`w-full bg-sheet ${textbox}`}
      />
      {create.isError && (
        <p role="alert" className="mt-1 text-sm text-danger">
          Couldn't create. Press Enter to try again.
        </p>
      )}
    </div>
  )
}
