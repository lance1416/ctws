import { idFrom, OBJECT_TYPES, personId, projectId, type ObjectType } from '@ctws/contracts'
import { KIND_ICON, type Kind } from '../../platform/ui/icons'
import { KIND_TEXT, KIND_TINT } from '../../platform/ui/kinds'
import { useRegistry } from '../registry'
import { useNarrowKindBlocks } from './kindBlocks'
import { ListHead } from './ListHead'

/** The full list of one kind with a thing: `?inspect=list:linked.<kind>.<type>.<id>`. */
export const LINKED_LIST = 'linked'

/** Its address, for a block's "All N". */
export const linkedListOf = (kind: ObjectType, of: { type: ObjectType; id: string }) =>
  `${LINKED_LIST}.${kind}.${of.type}.${of.id}`

const isKind = (word: string | undefined): word is ObjectType =>
  (OBJECT_TYPES as readonly string[]).includes(word ?? '')

/**
 * ONE KIND WITH A THING, ALL OF IT (FR-011 rule 3, FR-015): what a full page's block shows five
 * of, in the inspector beside that page; its module's own things first, then what is linked.
 */
export function LinkedList({ arg }: { arg: string }) {
  const [kind, type, id = ''] = arg.split('.')
  return isKind(kind) && isKind(type) && id ? (
    <Listed kind={kind} of={{ type, id }} />
  ) : (
    <p className="p-4 text-ui text-muted">This list is not here any more.</p>
  )
}

function Listed({ kind, of }: { kind: ObjectType; of: { type: ObjectType; id: string } }) {
  const registry = useRegistry()
  // The same sources as the full page's block: a person's and a project's own things, and the
  // rows a person's linked things are drawn by. The kind is fixed for the address, so are hooks.
  const mine = <T extends { kind: ObjectType }>(things: readonly T[]) =>
    things.filter((t) => t.kind === kind)
  const owned =
    of.type === 'person'
      ? mine(registry.personThings).map((t) => ({
          kind: t.kind,
          ...t.useThings(idFrom(personId, of.id)),
        }))
      : of.type === 'project'
        ? mine(registry.projectThings).map((t) => ({
            kind: t.kind,
            ...t.useThings(idFrom(projectId, of.id)),
          }))
        : []
  const [block] = useNarrowKindBlocks({
    of,
    kinds: [kind],
    owned,
    fullPage: '',
    linkedRows: of.type === 'person' || of.type === 'meeting' ? registry.personLinked : [],
    shown: Infinity,
  })
  const Icon = KIND_ICON[kind as Kind]
  if (!block) return null
  return (
    <>
      <ListHead
        badge={{ icon: Icon, tint: `${KIND_TINT[kind as Kind]} ${KIND_TEXT[kind as Kind]}` }}
        title={block.title}
        count={typeof block.count === 'number' ? block.count : 0}
      />
      <div className="px-4 py-3">
        {block.empty ? <p className="text-meta text-subtle">{block.empty}</p> : block.body}
      </div>
    </>
  )
}
