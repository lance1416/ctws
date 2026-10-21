import type { ObjectType } from '@ctws/contracts'

/** What a search view needs to know of a hit: which kind it is. */
export type Typed = { type: ObjectType }

/** The tab open in the results: every kind, or one of them. */
export type Tab = 'all' | ObjectType

/**
 * The kinds in search's one order (DES-001 section 4): the tabs, All's groups, the `/` list and
 * the places before anything is typed all follow it.
 */
export const KIND_ORDER: readonly ObjectType[] = [
  'person',
  'organisation',
  'task',
  'project',
  'meeting',
  'communication',
  'reading',
  'note',
]

/** In the All tab a kind shows this many, the rest behind its own tab (FR-024). */
const PER_KIND = 5

/** The kinds that have hits, in the kinds' fixed order, with how many each. */
export function kindsWithHits<H extends Typed>(
  hits: readonly H[],
): { type: ObjectType; n: number }[] {
  return KIND_ORDER.flatMap((type) => {
    const n = hits.filter((h) => h.type === type).length
    return n > 0 ? [{ type, n }] : []
  })
}

/** The hits of the tab, grouped by kind in the kinds' order; All caps each kind. */
export function grouped<H extends Typed>(
  hits: readonly H[],
  tab: Tab,
): { type: ObjectType; rows: H[]; more: number }[] {
  return kindsWithHits(hits)
    .filter((k) => tab === 'all' || k.type === tab)
    .map(({ type }) => {
      const all = hits.filter((h) => h.type === type)
      const rows = tab === 'all' ? all.slice(0, PER_KIND) : all
      return { type, rows, more: all.length - rows.length }
    })
}

/** The tab after `tab` with Tab, and before it with Shift+Tab; wrapping, All included. */
export function nextTab(tabs: readonly Tab[], tab: Tab, back = false): Tab {
  if (tabs.length === 0) return 'all'
  const at = Math.max(0, tabs.indexOf(tab))
  return tabs[(at + (back ? tabs.length - 1 : 1)) % tabs.length]!
}

/** How a kind is said in a tab or a scope chip (plural) and as a row's word (singular). */
export const KIND_WORDS: Record<ObjectType, { one: string; many: string }> = {
  task: { one: 'Task', many: 'Tasks' },
  reading: { one: 'Reading', many: 'Reading' },
  person: { one: 'Person', many: 'People' },
  meeting: { one: 'Meeting', many: 'Meetings' },
  project: { one: 'Project', many: 'Projects' },
  organisation: { one: 'Organisation', many: 'Organisations' },
  communication: { one: 'Communication', many: 'Communication' },
  note: { one: 'Note', many: 'Notes' },
}

/** The kinds a `/` offers, narrowed by what is typed after it. */
export function scopesMatching(typed: string): ObjectType[] {
  const t = typed.trim().toLocaleLowerCase()
  return KIND_ORDER.filter(
    (type) =>
      t === '' ||
      KIND_WORDS[type].many.toLocaleLowerCase().startsWith(t) ||
      KIND_WORDS[type].one.toLocaleLowerCase().startsWith(t),
  )
}
