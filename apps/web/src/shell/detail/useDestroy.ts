import type { ObjectType } from '@ctws/contracts'
import { useMutation, type QueryKey } from '@tanstack/react-query'
import { useForgetRecent } from '../search/recent'

/** Deletes the thing a pane shows: forgets it from Recent, then `onDone` (the pane closes). */
export function useDestroy({
  type,
  id,
  remove,
  awaits,
  onDone,
}: {
  type: ObjectType
  id: string
  remove: () => Promise<unknown>
  awaits: readonly QueryKey[]
  onDone: () => void
}) {
  const forget = useForgetRecent()
  return useMutation({
    mutationFn: remove,
    meta: { awaits, ownsError: true },
    onSuccess: () => {
      forget(type, id)
      onDone()
    },
  })
}
