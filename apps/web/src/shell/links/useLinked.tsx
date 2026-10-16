import { type LinkId, OBJECT_TYPES, type ObjectType } from '@ctws/contracts'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { problemText } from '../../platform/http/api'
import { Button } from '../../platform/ui/Button'
import { PanelEmpty } from '../../platform/ui/Panel'
import { AddLink } from './AddLink'
import { deleteLink, linkKeys, linksQuery, type Endpoint } from './api'

export type Linked = {
  of: Endpoint
  /** The kinds of thing listed: a page leaves out what it already shows. Every kind when left out. */
  types?: readonly ObjectType[] | undefined
}

/** One thing at the far end of an edge. */
export type Item = {
  type: ObjectType
  id: string
  title: string
  detail: string | null
  label: string
}

/**
 * Everything one thing is linked to, grouped by kind, and the way to link more. The edges are the
 * shell's; where another module's thing lives comes from the registry's `relations`.
 */
export function useLinked(of: Endpoint, types: readonly ObjectType[] | undefined) {
  // Which kind the picker is for: any kind from "+ Link", one kind from a block's own `+`.
  const [adding, setAdding] = useState<ObjectType | 'any' | null>(null)
  const links = useQuery(linksQuery(of, types))
  const groups = links.data ?? []
  const unlink = useMutation({
    mutationFn: (id: LinkId) => deleteLink(id),
    // Both ends showed the edge, and the far one can be any kind of thing.
    meta: { changes: OBJECT_TYPES, awaits: [linkKeys.all], ownsError: true },
  })
  const add = (
    <>
      {unlink.isError && (
        <p role="alert" className="px-2 text-sm text-danger">
          {problemText(unlink.error)}
        </p>
      )}
      <Button look="link" onClick={() => setAdding('any')} className="self-start">
        + Link
      </Button>
      {adding && (
        <AddLink
          of={of}
          only={adding === 'any' ? undefined : adding}
          onClose={() => setAdding(null)}
        />
      )}
    </>
  )
  // Nothing at all while loading: a skeleton would flash on every pane that opens.
  const unshown = links.isError ? (
    <PanelEmpty>Couldn't load the links.</PanelEmpty>
  ) : groups.length === 0 && links.isLoading ? null : groups.length === 0 ? (
    <div className="flex flex-col gap-1">
      <PanelEmpty>Nothing linked yet.</PanelEmpty>
      {add}
    </div>
  ) : undefined
  return { groups, unlink, setAdding, add, unshown }
}
