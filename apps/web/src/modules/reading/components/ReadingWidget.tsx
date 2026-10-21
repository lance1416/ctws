import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { PanelEmpty } from '../../../platform/ui/Panel'
import { ProjectRail } from '../../../shell/rows'
import { readingQuery } from '../api'
import { useToReadCount } from '../hooks/useToReadCount'
import { READING_ID } from '../logic/id'
import { isToRead, readingLabel } from '../logic/item'
import { hostOf, KindGlyph } from './marks'

/** The Workbench card: reading in no project, since anything filed shows on its project's page. */
export function ReadingWidget() {
  const items = useQuery(readingQuery({ unfiled: true }))
  const rows = (items.data ?? []).filter(isToRead)

  if (items.isError) {
    return (
      <p role="alert" className="px-2 py-1.5 text-ui text-stop-t">
        Couldn't load the reading list
      </p>
    )
  }
  if (items.isSuccess && rows.length === 0) return <PanelEmpty>Nothing unfiled</PanelEmpty>
  return (
    <ul className="min-w-0">
      {rows.slice(0, WIDGET_ROWS).map((item) => (
        <li key={item.id}>
          <Link
            to={`/${READING_ID}/${item.id}`}
            className="flex min-h-[42px] min-w-0 items-stretch gap-2.5 hover:bg-hover"
          >
            <ProjectRail projectId={item.projectId} />
            <span className="flex shrink-0 items-center text-muted">
              <KindGlyph kind={item.kind} />
            </span>
            <span className="flex min-w-0 flex-1 items-baseline gap-3 self-center">
              <span className="min-w-0 truncate text-ink">{readingLabel(item)}</span>
              <span className="ml-auto min-w-0 shrink truncate text-ui text-subtle">
                {item.kind === 'book' ? (item.author ?? '') : (hostOf(item.url) ?? '')}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function ReadingAside() {
  const count = useToReadCount()
  return count && <span className="text-ui text-subtle">{count}</span>
}

/** How many rows a workbench card shows before it defers to its page. */
const WIDGET_ROWS = 5
