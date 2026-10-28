import type { LinkCandidate, ObjectType } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import type { ComponentType, ReactNode } from 'react'
import { Avatar } from '../../platform/ui/Avatar'
import { KIND_ICON, type Kind } from '../../platform/ui/icons'
import { KIND_TEXT } from '../../platform/ui/kinds'
import type { OwnThings } from '../contract'
import { linksQuery } from '../links/api'
import { useRegistry } from '../registry'
import { atOf, NarrowRow, type NarrowBlockOf } from './narrow'

/** A narrow block's rows before its "All N" (FR-011). */
const SHOWN = 5

/**
 * A thing's blocks, a kind each, as its narrow page lists them (artboard 33): its module's own
 * things with it first, then what is only linked; five rows, then "All N" to the full page. The
 * same sources as the full page's `useKindBlocks`, drawn three columns wide.
 */
export function useNarrowKindBlocks({
  of,
  kinds,
  owned,
  fullPage,
  titles = {},
  none = () => 'None yet',
  linkedRows = [],
}: {
  of: { type: ObjectType; id: string }
  kinds: readonly ObjectType[]
  owned: readonly ({ kind: ObjectType } & OwnThings)[]
  /** The thing's full page, where "All N" goes. */
  fullPage: string
  titles?: Partial<Record<ObjectType, string>>
  none?: (kind: ObjectType) => string
  linkedRows?: readonly {
    kind: ObjectType
    Row: ComponentType<{ thing: LinkCandidate }>
    count?: (things: readonly LinkCandidate[]) => ReactNode
  }[]
}): NarrowBlockOf[] {
  const registry = useRegistry()
  const links = useQuery(linksQuery(of, kinds))
  const linkedOf = new Map((links.data ?? []).map((g) => [g.type, g.items]))
  return kinds.map((kind) => {
    const where = registry.relationFor(kind)
    const mine = owned.find((o) => o.kind === kind)
    const things = mine?.things ?? []
    const linked = (linkedOf.get(kind) ?? []).filter((i) => !things.some((t) => t.id === i.id))
    const own = linkedRows.find((r) => r.kind === kind)
    const Icon = KIND_ICON[kind as Kind]
    const mark = Icon ? (
      <Icon size={14} aria-hidden="true" className={KIND_TEXT[kind as Kind]} />
    ) : null
    const rows: ReactNode[] = [
      ...things.map((t) => (
        <NarrowRow
          key={t.id}
          mark={t.initials ? <Avatar initials={t.initials} /> : mark}
          thing={{ type: kind, id: t.id, ...(t.to && atOf(t.to) ? { at: atOf(t.to)! } : {}) }}
          to={t.to ?? where.to(t.id)}
          title={t.title}
          fact={t.lead ?? t.fact}
        />
      )),
      ...linked.map((item) => {
        const Fact = where.Fact
        return (
          <NarrowRow
            key={item.relationId}
            mark={where.Mark ? <where.Mark thing={item} /> : mark}
            thing={{ type: kind, id: item.id }}
            to={where.to(item.id)}
            title={item.title}
            fact={Fact ? <Fact thing={item} /> : null}
          />
        )
      }),
    ]
    const count = own?.count ? own.count(linked) : rows.length
    return {
      key: kind,
      title: titles[kind] ?? where.plural,
      count,
      empty: rows.length === 0 && !(mine?.isPending || links.isPending) ? none(kind) : null,
      all:
        rows.length > SHOWN
          ? { label: `All ${rows.length} ${where.plural.toLocaleLowerCase()}`, to: fullPage }
          : null,
      body: <ul className="flex flex-col">{rows.slice(0, SHOWN)}</ul>,
    }
  })
}
