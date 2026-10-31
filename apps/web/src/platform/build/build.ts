/**
 * What this build is: the release's tag (v0.31.5) or `dev`, said as it is, so the status bar and
 * the GitHub release read the same; and its commit when it was known.
 */
export const BUILD = {
  version: (import.meta.env.VITE_CTWS_VERSION as string | undefined) || 'dev',
  commit: (import.meta.env.VITE_CTWS_COMMIT as string | undefined) || null,
}
