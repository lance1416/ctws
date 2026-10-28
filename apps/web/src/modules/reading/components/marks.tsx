import type { ReadingItemResponse } from '@ctws/contracts'

/** Where a link is from, as a person says it: `w3.org`, not the whole URL. Null without one. */
export function hostOf(url: string | null): string | null {
  if (!url) return null
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return null
  }
}

/** The Workbench card's mark for a book or a link, named for a screen reader. */
export function KindGlyph({ kind }: { kind: ReadingItemResponse['kind'] }) {
  return kind === 'book' ? (
    <svg
      role="img"
      aria-label="Book"
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    >
      <path d="M3.5 3.5h4.2c.9 0 1.3.5 1.3 1.3v9.7c0-.8-.6-1.3-1.4-1.3H3.5zM14.5 3.5h-4.2c-.9 0-1.3.5-1.3 1.3v9.7c0-.8.6-1.3 1.4-1.3h4.1z" />
    </svg>
  ) : (
    <svg
      role="img"
      aria-label="Link"
      width="18"
      height="18"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <path d="M8.6 11.4l2.8-2.8M7.4 9.2L5.8 10.8a2.4 2.4 0 0 0 3.4 3.4l1.6-1.6M12.6 10.8l1.6-1.6a2.4 2.4 0 0 0-3.4-3.4L9.2 7.4" />
    </svg>
  )
}
