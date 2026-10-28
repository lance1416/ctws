import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Block, BlockFailed, SkeletonRows } from '../../../platform/ui/Block'
import { useRowsThatFit } from '../../../shell/workbench'
import { readingQuery } from '../api'
import { KindGlyph } from '../components/marks'
import { READING_ID } from '../logic/id'
import { readingLabel } from '../logic/item'

/** A row: two lines and its padding. */
const ROW_PX = 52

/** "stripe.com/blog/idempotency": an address without its scheme, as it is read aloud. */
const shortAddress = (url: string | null) =>
  url?.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '') ?? ''

/**
 * READING ON THE WORKBENCH (FR-076, artboards 10 and 22): what is being read now, each with its
 * kind, its title, and its author or address. As many as the place holds; the rest are in Reading.
 */
export function ReadingNow() {
  const items = useQuery(readingQuery())
  const [list, fits] = useRowsThatFit(ROW_PX, 5)
  const reading = (items.data ?? []).filter((i) => i.status === 'reading')
  return (
    <Block
      kind="reading"
      title="Reading"
      empty={items.isSuccess && reading.length === 0 ? 'Nothing being read' : null}
    >
      {items.isError ? (
        <BlockFailed what="reading" onRetry={() => void items.refetch()} />
      ) : !items.isSuccess ? (
        <SkeletonRows rows={2} />
      ) : (
        <ul ref={list} className="flex min-h-0 flex-1 flex-col overflow-hidden p-1.5">
          {reading.slice(0, fits).map((item) => (
            <li key={item.id}>
              <Link
                to={`/${READING_ID}/${item.id}`}
                data-reading-now={item.id}
                className="grid h-13 grid-cols-[16px_minmax(0,1fr)] items-start gap-x-2.5 rounded-control px-3 py-2 hover:bg-hover"
              >
                <span className="mt-0.5 text-reading">
                  <KindGlyph kind={item.kind} />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-ui font-medium text-ink">
                    {readingLabel(item)}
                  </span>
                  <span className="truncate text-meta text-muted">
                    {item.kind === 'book' ? (item.author ?? '') : shortAddress(item.url)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Block>
  )
}
