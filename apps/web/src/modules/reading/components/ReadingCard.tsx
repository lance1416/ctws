import type { ReadingItemResponse } from '@ctws/contracts'
import { Link } from 'react-router-dom'
import { shortDay, ymd } from '../../../platform/time/dates'
import { KIND_ICON, LinkIcon } from '../../../platform/ui/icons'
import { linkLabel } from '../../../platform/ui/url'
import { useAccountToday, useTimeZone } from '../../../shell/auth'
import { nameBesideSite, READING_STATUS_LABEL } from '../logic/item'

/** "martinfowler.com" for a link, the author for a book: the line under a title. */
export const byline = (item: ReadingItemResponse) =>
  item.kind === 'book' ? item.author : item.url ? linkLabel(item.url).split('/')[0]! : null

/**
 * One thing being read, as the overview's card (FR-072, artboard 18): its title and who wrote it
 * or where it lives, its status, who recommended it or which project it is in, and since when.
 */
export function ReadingCard({ item }: { item: ReadingItemResponse }) {
  const today = useAccountToday()
  const zone = useTimeZone()
  const Icon = item.kind === 'book' ? KIND_ICON.reading : LinkIcon
  return (
    <Link
      to={`/reading/${item.id}`}
      data-reading-card={item.id}
      className="flex min-w-0 flex-col gap-3 rounded-block border border-line bg-panel p-4 hover:border-line-strong"
    >
      <span className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="inline-grid size-8 shrink-0 place-items-center rounded-control bg-reading-bg text-reading"
        >
          <Icon size={16} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-ui font-medium text-ink">{nameBesideSite(item)}</span>
          {byline(item) && <span className="truncate text-meta text-muted">{byline(item)}</span>}
        </span>
        <span className="inline-flex h-5.5 shrink-0 items-center rounded-control bg-reading-bg px-2 text-meta font-medium text-reading-t">
          {READING_STATUS_LABEL[item.status]}
        </span>
      </span>
      <span className="flex items-center justify-between gap-3 text-meta text-muted">
        <span className="flex min-w-0 items-center gap-1.5 truncate">
          {item.recommendedBy ? (
            <>
              <KIND_ICON.person size={12} aria-hidden="true" />
              Recommended by {item.recommendedBy.name}
            </>
          ) : item.projectName ? (
            <>
              <KIND_ICON.project size={12} aria-hidden="true" />
              In {item.projectName}
            </>
          ) : null}
        </span>
        <span className="shrink-0">
          Since {shortDay(ymd(new Date(item.statusSince), zone), today)}
        </span>
      </span>
    </Link>
  )
}
