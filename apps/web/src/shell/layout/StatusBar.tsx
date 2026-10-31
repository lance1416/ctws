import { BUILD } from '../../platform/build/build'

/**
 * THE STATUS BAR (DES-001 section 4): the frame's last 24 on a desk, across its whole width. On the
 * right what the app is, the version always last; what it is doing (saving, offline) will go on
 * the left. Items 16 apart, no separators. A phone has none: its version ends More.
 */
export function StatusBar() {
  return (
    <footer
      aria-label="Status"
      className="flex h-6 shrink-0 items-center justify-end gap-4 border-t border-line bg-chrome px-3 text-meta text-subtle tabular-nums max-lg:hidden"
    >
      <BuildVersion />
    </footer>
  )
}

/** The release running, as its tag ("v0.31.5"); its commit on a hover and to a screen reader. */
export function BuildVersion() {
  const commit = BUILD.commit ? `Build ${BUILD.commit}` : undefined
  return (
    <span data-build-version title={commit}>
      {BUILD.version}
      {commit && <span className="sr-only">, {commit}</span>}
    </span>
  )
}
