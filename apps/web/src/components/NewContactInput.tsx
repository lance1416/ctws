import type { ContactResponse } from '@ctws/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { createContact } from '../api/contacts'

/**
 * MAKING A PERSON: type a name, press Enter.
 *
 * The same shape as 新任务 and 加到待读, which is the point -- this app makes things by typing one
 * line into a box, and a contact was the one thing that opened a form instead. Everything else
 * about the person is filled in afterwards, in the pane that opens.
 */
export function NewContactInput({
  projectId,
  onCreated,
  placeholder = '新建联系人',
}: {
  /** The project a person made here is on, when made from inside one. */
  projectId?: string | undefined
  onCreated: (contact: ContactResponse) => void
  placeholder?: string
}) {
  const qc = useQueryClient()
  const [name, setName] = useState('')

  const create = useMutation({
    mutationFn: (value: string) =>
      createContact({ name: value, ...(projectId ? { projectIds: [projectId] } : {}) }),
    onSuccess: async (contact) => {
      setName('')
      await qc.invalidateQueries({ queryKey: ['contacts'] })
      // Straight into the pane: a name on its own is never the whole of what you know about
      // somebody, and this is the moment you have the rest of it to hand.
      onCreated(contact)
    },
  })

  return (
    <div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
          if (name.trim() === '' || create.isPending) return
          create.mutate(name.trim())
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-9 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-fg placeholder:text-fg-muted"
      />
      {create.isError && (
        <p role="alert" className="mt-1 text-sm text-danger">
          没能新建，再按一次回车重试
        </p>
      )}
    </div>
  )
}
