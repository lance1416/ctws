import type { ReadingItemResponse, ReadingStatus } from '@ctws/contracts'

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

const TONE: Record<ReadingStatus, string> = {
  todo: 'text-ink-muted',
  reading: 'text-ink',
  done: 'text-ink-subtle',
  dropped: 'text-ink-subtle',
}

/** The list row's mark, toned by status; decoration, since the line below says the kind. */
export function StatusMark({ item }: { item: Pick<ReadingItemResponse, 'kind' | 'status'> }) {
  return (
    <span aria-hidden="true" className={`flex h-6 shrink-0 items-center ${TONE[item.status]}`}>
      {item.kind === 'book' ? <BookMark /> : <LinkMark />}
    </span>
  )
}

function BookMark() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4">
      <path
        d="M8 4.2C6.8 3.4 5.4 3.2 3.5 3.3v8c1.9-.1 3.3.1 4.5.9 1.2-.8 2.6-1 4.5-.9v-8c-1.9-.1-3.3.1-4.5.9Zm0 0v9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function LinkMark() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4">
      <path
        d="M6.5 9.5a2.8 2.8 0 0 0 4 0l2-2a2.8 2.8 0 0 0-4-4l-.8.8M9.5 6.5a2.8 2.8 0 0 0-4 0l-2 2a2.8 2.8 0 0 0 4 4l.8-.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  )
}
