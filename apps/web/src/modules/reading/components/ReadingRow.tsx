import { readingIsFinished, type ReadingItemResponse, type ReadingStatus } from '@ctws/contracts'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useMutation } from '@tanstack/react-query'
import { problemText } from '../../../platform/http/api'
import { patchReadingItem, readingKeys } from '../api'
import { readingLabel } from '../logic/item'
import { hostOf, StatusMark } from './marks'
import { PLAN_DAYS, type PlanDay } from '../logic/plans'
import { daysAgoIn } from '../../../platform/time/dates'
import { leadFor, ProjectRail, ROW_BODY, RowLead } from '../../../shell/rows'
import { MENU_ITEM, MENU_SURFACE } from '../../../platform/ui/menuSurface'
import { useNow } from '../../../platform/time/useNow'
import { useTimeZone } from '../../../shell/auth'

/** "Added 17 days ago". A count, not a date: a pile is read to find what has gone stale. */
export function addedLabel(createdAt: string, timeZone: string, now: Date): string {
  const days = daysAgoIn(createdAt, timeZone, now)
  if (days <= 0) return 'Added today'
  if (days === 1) return 'Added yesterday'
  return `Added ${days} days ago`
}

const FINISH: Record<PlanDay, string> = {
  today: 'Finish today',
  tomorrow: 'Finish tomorrow',
  thisWeek: 'Finish this week',
  nextWeek: 'Finish next week',
}

/** What the one visible button does next, by where the item is now. */
const NEXT: Record<ReadingStatus, { status: ReadingStatus; label: string } | null> = {
  todo: { status: 'reading', label: 'Start reading' },
  reading: { status: 'done', label: 'Finished' },
  done: null,
  dropped: null,
}

export function ReadingRow({
  item,
  today,
  onOpen,
}: {
  item: ReadingItemResponse
  /** The account's today, from the page. */
  today: string
  /** Opens its pane. */
  onOpen: () => void
}) {
  const timeZone = useTimeZone()
  const now = useNow()
  const save = useMutation({
    mutationFn: (patch: Parameters<typeof patchReadingItem>[1]) => patchReadingItem(item.id, patch),
    meta: { changes: ['reading'], awaits: [readingKeys.all], ownsError: true },
  })

  const label = readingLabel(item)
  const finished = readingIsFinished(item.status)
  const next = NEXT[item.status]
  // Empty parts are dropped, and the host too when it is already the title (an untitled link).
  const meta = [
    item.projectName,
    item.kind === 'book' ? item.author : item.title || item.fetchedTitle ? hostOf(item.url) : null,
    addedLabel(item.createdAt, timeZone, now),
  ].filter(Boolean)

  return (
    /* The whole row opens its pane; the links and buttons in it stop the click. */
    <li
      data-reading-row={item.id}
      onClick={onOpen}
      className="group flex min-h-11 min-w-0 cursor-pointer"
    >
      {/* The day you mean to finish it; a finished item's plan is no longer shown. */}
      <RowLead
        lead={
          item.planOn && !finished
            ? leadFor({ dueAt: null, scheduledOn: item.planOn }, today, timeZone)
            : null
        }
      />
      <ProjectRail projectId={item.projectId} />
      <div className={`${ROW_BODY} items-start gap-2.5 py-2.5 pr-1 group-hover:bg-hover`}>
        <StatusMark item={item} />

        <div className="min-w-0 flex-1">
          {item.url ? (
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer noopener"
              onClick={(e) => e.stopPropagation()}
              className={`block max-w-full truncate hover:underline ${
                finished ? 'text-subtle line-through' : 'text-ink'
              }`}
            >
              {label}
            </a>
          ) : (
            /* A book has nowhere to go, so its title opens its pane. */
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onOpen()
              }}
              className={`block max-w-full truncate rounded-control text-left hover:underline ${
                finished ? 'text-subtle line-through' : 'text-ink'
              }`}
            >
              {label}
            </button>
          )}
          {meta.length > 0 && <p className="truncate text-ui text-muted">{meta.join(' · ')}</p>}
          {item.fetchedSummary && !item.title && (
            <p data-reading-summary className="truncate text-ui text-muted">
              {item.fetchedSummary}
            </p>
          )}
          {save.isError && (
            <p role="alert" className="text-ui text-stop-t">
              {problemText(save.error)}
            </p>
          )}
        </div>

        {next && (
          <button
            type="button"
            onClick={() => save.mutate({ status: next.status })}
            // Opacity, never `hidden`, which leaves the tab order. Always shown on touch.
            className="h-7 shrink-0 rounded-control border border-line-strong px-2 text-ui text-ink opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-hover [@media(hover:none)]:opacity-100"
          >
            {next.label}
          </button>
        )}

        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            aria-label={`More for “${label}”`}
            className="h-7 w-7 shrink-0 rounded-control text-subtle hover:bg-hover hover:text-ink"
          >
            <svg aria-hidden="true" viewBox="0 0 16 16" className="mx-auto h-4 w-4">
              <circle cx="3.5" cy="8" r="1.25" fill="currentColor" />
              <circle cx="8" cy="8" r="1.25" fill="currentColor" />
              <circle cx="12.5" cy="8" r="1.25" fill="currentColor" />
            </svg>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" sideOffset={4} className={MENU_SURFACE}>
              <Item onSelect={onOpen}>Open</Item>
              {/* Named plans, not a date picker: "this week" is the thought a person has. */}
              {PLAN_DAYS.map(({ id, day }) => (
                <Item key={id} onSelect={() => save.mutate({ planOn: day(today) })}>
                  {FINISH[id]}
                </Item>
              ))}
              {item.planOn && (
                <Item onSelect={() => save.mutate({ planOn: null })}>Clear the plan</Item>
              )}
              {!finished && (
                <Item onSelect={() => save.mutate({ status: 'dropped' })}>Drop it</Item>
              )}
              {finished && (
                <Item onSelect={() => save.mutate({ status: 'todo' })}>Back to the list</Item>
              )}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </li>
  )
}

function Item({ children, onSelect }: { children: string; onSelect: () => void }) {
  return (
    <DropdownMenu.Item onSelect={onSelect} className={MENU_ITEM}>
      {children}
    </DropdownMenu.Item>
  )
}
