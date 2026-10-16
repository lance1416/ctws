import type { PersonResponse } from '@ctws/contracts'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { createPerson } from '../api'
import { useComposing } from '../../../platform/keyboard/composition'
import { textbox } from '../../../platform/ui/formStyles'

/** Type a name and press Enter; the rest is filled in on the pane that opens. */
export function NewPersonInput({ onCreated }: { onCreated: (person: PersonResponse) => void }) {
  const composing = useComposing()
  const [name, setName] = useState('')

  const create = useMutation({
    mutationFn: async (value: string) => {
      const made = await createPerson({ name: value })
      // Emptied once the server has them, not after the list is read again: what is typed in the
      // meantime is the next name.
      setName('')
      return made
    },
    meta: { awaits: [['people']], ownsError: true },
    onSuccess: (person) => onCreated(person),
  })

  return (
    <div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        {...composing.bind}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' || composing.composingNow(e)) return
          if (name.trim() === '' || create.isPending) return
          create.mutate(name.trim())
        }}
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
