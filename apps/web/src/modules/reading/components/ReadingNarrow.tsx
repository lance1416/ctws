import { idFrom, readingId } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { shortDay, ymd } from '../../../platform/time/dates'
import { Avatar } from '../../../platform/ui/Avatar'
import { DurationIcon, KIND_ICON, LinkIcon } from '../../../platform/ui/icons'
import { KIND_ON_TINT, KIND_TEXT, KIND_TINT } from '../../../platform/ui/kinds'
import { useAccountToday, useTimeZone } from '../../../shell/auth'
import {
  InspectLink,
  NarrowBlocks,
  NarrowHead,
  PropRow,
  PropRows,
  useNarrowKindBlocks,
} from '../../../shell/inspector'
import { useRegistry } from '../../../shell/registry'
import { Timeline } from '../../../shell/timeline'
import { readingQuery } from '../api'
import { initialsOf, READING_STATUS_LABEL, readingLabel } from '../logic/item'
import { READING_ID } from '../logic/id'
import { SINCE_WORDS } from '../pages/ReadingItem'
import { byline } from './ReadingCard'

/**
 * A READING ITEM IN THE INSPECTOR (FR-022, artboard 33): its title, who wrote it or where it
 * lives and its status; since when, and who recommended it; what it is linked to; and the latest
 * of its timeline.
 */
export function ReadingNarrow({ id }: { id: string }) {
  const items = useQuery(readingQuery())
  const registry = useRegistry()
  const today = useAccountToday()
  const zone = useTimeZone()
  const item = items.data?.find((i) => i.id === idFrom(readingId, id))
  const page = `/${READING_ID}/${id}`
  const blocks = useNarrowKindBlocks({
    of: { type: 'reading', id },
    kinds: (['task', 'person', 'meeting'] as const).filter((k) =>
      registry.relations.some((r) => r.type === k),
    ),
    owned: [],
    fullPage: page,
  })
  if (items.isSuccess && !item)
    return <p className="p-4 text-ui text-muted">This item is not here any more.</p>
  if (!item) return null
  const Icon = item.kind === 'book' ? KIND_ICON.reading : LinkIcon
  return (
    <>
      <NarrowHead
        mark={<Icon size={20} aria-hidden="true" className={KIND_TEXT.reading} />}
        title={readingLabel(item)}
        tags={
          <>
            {byline(item) && <span className="text-muted">{byline(item)}</span>}
            <span
              className={`inline-flex h-5.5 items-center rounded-key px-2 font-medium ${KIND_TINT.reading} ${KIND_ON_TINT.reading}`}
            >
              {READING_STATUS_LABEL[item.status]}
            </span>
          </>
        }
      />
      <PropRows>
        <PropRow icon={DurationIcon} label={SINCE_WORDS[item.status]}>
          {shortDay(ymd(new Date(item.statusSince), zone), today)}
        </PropRow>
        <PropRow icon={KIND_ICON.person} label="From">
          {item.recommendedBy && (
            <InspectLink
              thing={{ type: 'person', id: item.recommendedBy.id }}
              to={`/people/${item.recommendedBy.id}`}
              className="inline-flex items-center gap-1.5 hover:underline"
            >
              <Avatar initials={initialsOf(item.recommendedBy.name)} />
              {item.recommendedBy.name}
            </InspectLink>
          )}
        </PropRow>
      </PropRows>
      <NarrowBlocks
        blocks={[
          ...blocks,
          {
            key: 'timeline',
            title: 'Timeline',
            last: true,
            body: (
              <Timeline
                of={{ type: 'reading', id }}
                last={5}
                everything={{ label: `Everything with ${readingLabel(item)}`, to: page }}
              />
            ),
          },
        ]}
      />
    </>
  )
}
