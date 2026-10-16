import { useMatches } from 'react-router-dom'

/** Where a step of a page's path links. */
type Step = { label: string; to: string }

/** A page's canonical path: steps that link, then the page itself, which does not. */
export type Crumbs = readonly [] | readonly [...Step[], { label: string }]

/** What a page is drawn on: the sheet, or the desk the Workbench's tiles sit on. */
type Ground = 'sheet' | 'desk'

/**
 * What a route tells the frame about its page, as its `handle`. The frame reads it from the
 * matched routes, so it holds from the page's first render rather than an effect later.
 */
export type PageHandle = {
  /**
   * The page's place in the hierarchy, not the way it was reached. A hook, so a page whose name is
   * data can read it; the frame calls it once per page.
   */
  useCrumbs?: () => Crumbs
  /** The sheet unless it says otherwise. The frame paints `main`, edge to edge. */
  ground?: Ground
}

/** The deepest matched route's say on `key`, and that route's id. */
export function usePage<K extends keyof PageHandle>(
  key: K,
): { id: string; value: NonNullable<PageHandle[K]> } | null {
  const matches = useMatches()
  for (const match of [...matches].reverse()) {
    const value = (match.handle as PageHandle | undefined)?.[key]
    if (value !== undefined) return { id: match.id, value: value as NonNullable<PageHandle[K]> }
  }
  return null
}

/** A page at the top of the hierarchy, named `label`. */
export const topPage = (label: string): PageHandle => ({ useCrumbs: () => [{ label }] })

/** A kind's own page, under Things. */
export const kindPage = (label: string): PageHandle => ({
  useCrumbs: () => [{ label: 'Things', to: '/things' }, { label }],
})
