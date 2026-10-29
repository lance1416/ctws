import { lazy, Suspense, type ComponentType } from 'react'

/**
 * A part loaded when first drawn, not with the app: a page or a dialog the first page of a visit
 * does not need, kept out of the bundle every page parses before it can ask for its data
 * (baseline.md §8). Nothing is shown while it arrives, as before its data does.
 */
export function lazyPage<P extends object>(
  load: () => Promise<ComponentType<P>>,
): ComponentType<P> {
  const Loaded = lazy(async () => ({ default: await load() }))
  return function LazyPage(props: P) {
    return (
      <Suspense fallback={null}>
        <Loaded {...props} />
      </Suspense>
    )
  }
}
