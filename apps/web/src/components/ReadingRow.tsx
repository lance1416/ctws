import type { ReadingItemResponse, ReadingStatus } from '@ctws/contracts'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { deleteReadingItem, patchReadingItem, readingLabel } from '../api/reading'
import { addDays, dayPhrase, daysAgoIn, nextMonday, todayIn } from '../dueAt'

/**
 * ONE ROW OF 待读.
 *
 * It wears the same anatomy as a task row -- a mark, a title, one muted second line -- because
 * they are read by the same person on the same screen, and a second module that invented its own
 * row shape would make the workspace look like two products stapled together.
 *
 * What it does NOT borrow is behaviour: this row has no drag handle, no tree, no dates. A reading
 * list is a pile, and the only question it answers is 「接下来读什么」.
 */

/** 「17 天前加的」. A count, not a date: a reading pile is read to find what has gone stale. */
export function addedLabel(createdAt: string, timeZone: string, now: Date = new Date()): string {
  const days = daysAgoIn(createdAt, timeZone, now)
  if (days <= 0) return '今天加的'
  if (days === 1) return '昨天加的'
  return `${days} 天前加的`
}

/** 「想读完」 as named days. No exact date: nobody plans reading to the day. */
const PLANS: { label: string; day: (today: string) => string }[] = [
  { label: '今天读完', day: (t) => t },
  { label: '明天读完', day: (t) => addDays(t, 1) },
  { label: '这周读完', day: (t) => addDays(nextMonday(t), -1) },
  { label: '下周读完', day: (t) => nextMonday(t) },
]

/** What the one visible button does next, by where the item is now. */
const NEXT: Record<ReadingStatus, { status: ReadingStatus; label: string } | null> = {
  todo: { status: 'reading', label: '开始读' },
  reading: { status: 'done', label: '读完了' },
  done: null,
  dropped: null,
}

const MARK: Record<ReadingStatus, string> = {
  todo: 'text-fg-muted',
  reading: 'text-fg',
  done: 'text-fg-subtle',
  dropped: 'text-fg-subtle',
}

export function ReadingRow({
  item,
  timeZone,
  here,
}: {
  item: ReadingItemResponse
  timeZone: string
  /** The project this list is already inside, if any. Its name is then not worth repeating -- the
   *  same rule the dependency pane keeps, and why the task tree shows no breadcrumb. */
  here?: string
}) {
  const qc = useQueryClient()
  const today = todayIn(timeZone)
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState('')
  // Set when 改标题 is chosen, so the menu's closing hands focus to the NEW INPUT instead of back
  // to its own trigger. Radix restores focus on close by default, which blurred the editor the
  // moment it appeared -- an inline rename that could never be typed into.
  const takingFocus = useRef(false)
  const titleInput = useRef<HTMLInputElement>(null)
  const refresh = () => qc.invalidateQueries({ queryKey: ['reading'] })

  const save = useMutation({
    mutationFn: (patch: Parameters<typeof patchReadingItem>[1]) => patchReadingItem(item.id, patch),
    onSuccess: async () => {
      setRenaming(false)
      await refresh()
    },
  })
  const drop = useMutation({
    mutationFn: () => deleteReadingItem(item.id),
    onSuccess: refresh,
  })

  const label = readingLabel(item)
  const finished = item.status === 'done' || item.status === 'dropped'
  const next = NEXT[item.status]
  const host = hostOf(item.url)
  // The second line, in the order a person scans it: what it is about, then where it came from,
  // then how long it has been waiting. Each part is dropped when it has nothing to say -- and the
  // host is dropped when it is ALREADY the title, which is what an untitled link shows.
  const meta = [
    item.projectId === here ? null : item.projectName,
    // The plan leads the rest of the line when there is one: it is the only part that says
    // anything about WHEN, and 「17 天前加的」 is about how long it has been ignored.
    item.planOn ? `想${dayPhrase(item.planOn, today)}读完` : null,
    item.kind === 'book' ? item.author : host === label ? null : host,
    addedLabel(item.createdAt, timeZone),
  ].filter(Boolean)

  return (
    <li className="group flex min-h-9 items-center gap-2 rounded-lg py-1 pr-1 hover:bg-surface-hover">
      {/* The kind, as a shape. Never alone: a book names its author and a link names its host on
          the line below, so the glyph is decoration over information (WCAG 1.4.1). */}
      <span aria-hidden="true" className={`shrink-0 ${MARK[item.status]}`}>
        {item.kind === 'book' ? <BookMark /> : <LinkMark />}
      </span>

      <div className="min-w-0 flex-1">
        {renaming ? (
          <input
            ref={titleInput}
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Escape cancels and Enter saves. Clicking away does NEITHER: a blur that threw the
              // typed title away is a keystroke-eating trap, and an editor left open is visible.
              if (e.key === 'Escape') setRenaming(false)
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                const t = draft.trim()
                // An emptied title is a cleared title for a link (it goes back to showing its
                // host) and is refused for a book, which is the server's rule, not this row's.
                save.mutate({ title: t === '' ? null : t })
              }
            }}
            aria-label="标题"
            className="h-7 w-full rounded-lg border border-border-strong bg-surface px-2 text-sm text-fg"
          />
        ) : item.url ? (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer noopener"
            className={`block truncate text-sm hover:underline ${
              finished ? 'text-fg-subtle line-through' : 'text-fg'
            }`}
          >
            {label}
          </a>
        ) : (
          <span
            className={`block truncate text-sm ${
              finished ? 'text-fg-subtle line-through' : 'text-fg'
            }`}
          >
            {label}
          </span>
        )}
        {meta.length > 0 && <p className="truncate text-xs text-fg-subtle">{meta.join(' · ')}</p>}
      </div>

      {/* One visible action, named by what it does. Everything rarer is behind the menu: a row
          with five buttons on it is a row nobody reads. */}
      {next && (
        <button
          type="button"
          onClick={() => save.mutate({ status: next.status })}
          // OPACITY, never `hidden`: a display:none button is not in the tab order at all, so
          // the one action on this row would be unreachable without a mouse. On a touch screen
          // there is no hover, so it is simply always there -- the same rule the task row keeps.
          className="h-7 shrink-0 rounded-lg border border-border-subtle px-2 text-xs text-fg opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-surface [@media(hover:none)]:opacity-100"
        >
          {next.label}
        </button>
      )}

      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          aria-label={`「${label}」的更多操作`}
          className="h-7 w-7 shrink-0 rounded-lg text-fg-subtle hover:bg-surface hover:text-fg"
        >
          <svg aria-hidden="true" viewBox="0 0 16 16" className="mx-auto h-4 w-4">
            <circle cx="3.5" cy="8" r="1.25" fill="currentColor" />
            <circle cx="8" cy="8" r="1.25" fill="currentColor" />
            <circle cx="12.5" cy="8" r="1.25" fill="currentColor" />
          </svg>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={4}
            // THE MOMENT THE MENU HANDS FOCUS BACK. By default that is its own trigger, which
            // would blur the editor that just appeared; `autoFocus` on the input is not enough,
            // because this runs after the input has mounted. So we take the hand-off and put
            // focus where the person is about to type.
            onCloseAutoFocus={(e) => {
              if (!takingFocus.current) return
              e.preventDefault()
              takingFocus.current = false
              titleInput.current?.focus()
            }}
            className="min-w-36 rounded-xl border border-border-subtle bg-surface-panel p-1 shadow-panel"
          >
            <Item
              onSelect={() => {
                takingFocus.current = true
                setDraft(item.title ?? '')
                setRenaming(true)
              }}
            >
              改标题
            </Item>
            {/* 「想读完的那天」, as NAMED DECISIONS rather than a date picker -- the same choice
                the overdue row's triage made, and for the same reason: a calendar makes you
                compute the date, where 「这周末」 is the thought you actually had. The exact day
                is not offered because nobody plans reading to the day. */}
            {PLANS.map(({ label, day }) => (
              <Item key={label} onSelect={() => save.mutate({ planOn: day(today) })}>
                {label}
              </Item>
            ))}
            {item.planOn && <Item onSelect={() => save.mutate({ planOn: null })}>不定日子</Item>}
            {!finished && <Item onSelect={() => save.mutate({ status: 'dropped' })}>不读了</Item>}
            {finished && <Item onSelect={() => save.mutate({ status: 'todo' })}>放回待读</Item>}
            <Item onSelect={() => drop.mutate()}>删除</Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </li>
  )
}

function Item({ children, onSelect }: { children: string; onSelect: () => void }) {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      className="flex h-8 cursor-default items-center rounded-lg px-2 text-sm text-fg outline-none data-[highlighted]:bg-surface-hover"
    >
      {children}
    </DropdownMenu.Item>
  )
}

function hostOf(url: string | null): string | null {
  if (!url) return null
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return null
  }
}

/** An open book: two leaves and a spine. */
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

/** A link: the chain idiom every browser uses for the same thing. */
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
