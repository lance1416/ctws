import { useState, type ComponentProps, type ReactNode } from 'react'
import { DangerZone } from '../../platform/ui/DangerZone'
import { DetailPane } from '../../platform/ui/DetailPane'
import { UnsavedAsk } from '../../platform/ui/UnsavedAsk'
import { useUnsavedGuard } from '../../platform/ui/unsavedGuard'
import { LinkedSection } from '../links'
import { type Recent, useRecordRecent } from '../search'
import { BackHead } from './BackHead'

/**
 * What an item's pane keeps between its reading and its form: whether it is editing, and whether
 * the form holds unsaved changes. Every way out of the pane goes through `close`, which asks first
 * when there is something to lose.
 */
export function useItemPane(onClose: () => void) {
  const [editing, setEditing] = useState(false)
  const [unsaved, setUnsaved] = useState(false)
  const guard = useUnsavedGuard(unsaved)
  return {
    editing,
    setEditing,
    /** For the form: whether anything differs from what it opened on. */
    onUnsaved: setUnsaved,
    guard,
    close: () => guard.leave(onClose),
  }
}

type ItemPaneState = ReturnType<typeof useItemPane>

/**
 * The pane of one item a module lists: back to the list, the leave guard's question, the module's
 * reading or form, what it is linked to, and its destructive action last, under a rule.
 */
export function ItemPane({
  pane,
  label,
  back,
  note,
  recent,
  linked,
  danger,
  children,
}: {
  pane: ItemPaneState
  /** The kind's name: the pane's accessible name and the back link's words. */
  label: string
  /** The kind's list. */
  back: string
  /** Beside the back link. */
  note?: ReactNode
  /** Where the item goes in the recently opened list. */
  recent: Recent
  linked: Pick<ComponentProps<typeof LinkedSection>, 'of' | 'types'>
  danger: ReactNode
  children: ReactNode
}) {
  useRecordRecent(recent)
  return (
    <DetailPane label={label} onClose={pane.close}>
      <div className="flex flex-col gap-4">
        <BackHead to={back} label={label} onClose={pane.close} note={note} />
        <UnsavedAsk guard={pane.guard} />
        {children}
      </div>
      <LinkedSection of={linked.of} types={linked.types} className="mt-4" />
      <DangerZone>{danger}</DangerZone>
    </DetailPane>
  )
}
