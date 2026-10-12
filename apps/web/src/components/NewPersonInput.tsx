import type { PersonResponse } from '@ctws/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { createPerson } from '../api/people'
import { useComposing } from '../composition'
import { textbox } from './formStyles'

/**
 * MAKING A PERSON: type a name, press Enter.
 *
 * The same shape as the new-task and add-to-reading boxes, which is the point: this app makes
 * things by typing one line into a box. Everything else about the person is filled in
 * afterwards, in the pane that opens.
 */
export function NewPersonInput({
  projectId,
  onCreated,
  placeholder = 'Add a name',
}: {
  /** The project a person made here is on, when made from inside one. */
  projectId?: string | undefined
  onCreated: (person: PersonResponse) => void
  placeholder?: string
}) {
  const qc = useQueryClient()
  const composing = useComposing()
  const [name, setName] = useState('')

  const create = useMutation({
    mutationFn: (value: string) =>
      createPerson({ name: value, ...(projectId ? { projectIds: [projectId] } : {}) }),
    onSuccess: async (person) => {
      setName('')
      await qc.invalidateQueries({ queryKey: ['people'] })
      // Straight into the pane: a name on its own is never the whole of what you know about
      // somebody, and this is the moment you have the rest of it to hand.
      onCreated(person)
    },
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
        placeholder={placeholder}
        aria-label={placeholder}
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
