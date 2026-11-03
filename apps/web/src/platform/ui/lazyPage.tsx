import { lazy, Suspense, type ComponentType } from 'react'

/**
 * A part loaded when first drawn, kept out of the bundle every page parses before it can ask for
 * its data. Nothing is shown while it arrives.
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
