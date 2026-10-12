import type { ReadingStatus } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useForgetWhenGone } from '../recent'
import { useNavigate, useParams } from 'react-router-dom'
import { listReading, readingKey } from '../api/reading'
import { EmptyState } from '../components/EmptyState'
import { LIST_MEASURE } from '../rowLead'
import { AddReading } from '../components/AddReading'
import { ReadingDetail } from '../components/ReadingDetail'
import { ReadingRow } from '../components/ReadingRow'
import { useTimeZone } from '../useMe'
import { useCrumbs } from '../components/Location'

/**
 * THE READING LIST.
 *
 * ONE LIST, split by what you have done with each thing rather than by what it is: a book and an
 * article are read the same way, and a list sorted by type would make you look in two places to
 * find what to read next. What you are reading now comes first: it is the shortest section and
 * the one with a claim on today.
 */
const SECTIONS: { status: ReadingStatus; label: string }[] = [
  { status: 'reading', label: 'Reading now' },
  { status: 'todo', label: 'Reading' },
]

export function Reading() {
  useCrumbs([{ label: 'Things', to: '/things' }, { label: 'Reading' }])
  const items = useQuery({ queryKey: readingKey(), queryFn: () => listReading() })
  /**
   * 开着的是哪一条，写在 URL 里 —— 这一层就是 `/reading/<id>` 本身。
   *
   * 和人、和会议同一条路：一条读物没有自己的页，URL 留着好让「谁推荐的」那条边有地方可去
   * （以前它只能落到整张清单上），列表留在后面。
   */
  const { id: openId = null } = useParams()
  const navigate = useNavigate()
  const [showFinished, setShowFinished] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const timeZone = useTimeZone()

  const rows = items.data ?? []
  const gone = openId !== null && items.isSuccess && !rows.some((i) => i.id === openId)
  useForgetWhenGone('reading', openId, gone)
  const of = (status: ReadingStatus) => rows.filter((i) => i.status === status)
  // Finished and dropped are both off the list. They share a section because the difference
  // matters when you decide, not afterwards.
  const finished = rows.filter((i) => i.status === 'done' || i.status === 'dropped')
  const open = rows.filter((i) => i.status === 'todo' || i.status === 'reading')

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h1 ref={heading} tabIndex={-1} className="text-xl font-semibold focus:outline-none">
          Reading
        </h1>
      </div>

      {/* The same measure the task lists keep: a row whose menu sits 900px from its title is not
          using the width, it is spending it. */}
      <div className={`mt-4 ${LIST_MEASURE}`}>
        <AddReading />
      </div>

      {items.isPending && <p className="mt-6 text-ink-muted">Loading…</p>}
      {items.isError && (
        <p role="alert" className="mt-6 text-danger">
          {items.error instanceof Error
            ? items.error.message
            : "Couldn't load. Check that the server is running."}
        </p>
      )}
      {items.isSuccess && rows.length === 0 && <EmptyState title="The list is empty" />}

      {SECTIONS.map(({ status, label }) => {
        const section = of(status)
        if (section.length === 0) return null
        return (
          <section key={status} aria-label={label} className="mt-8">
            <h2 className="text-sm font-semibold text-ink-muted">
              {label} <span className="tabular-nums">{section.length}</span>
            </h2>
            <ul className={`mt-1 ${LIST_MEASURE}`}>
              {section.map((item) => (
                <ReadingRow
                  key={item.id}
                  item={item}
                  timeZone={timeZone}
                  onOpen={() => navigate(`/reading/${item.id}`)}
                />
              ))}
            </ul>
          </section>
        )
      })}

      {/* The finished pile, behind a switch -- the same rule the task tree learned: a list
          that keeps everything forever gets worse the longer it is used, and a list that drops
          things cannot be trusted. The count is the way back to them. */}
      {openId !== null &&
        (() => {
          const open = rows.find((i) => i.id === openId)
          if (open) return <ReadingDetail item={open} onClose={() => navigate('/reading')} />
          // 链接指向的东西已经不在了：说出来，别只留一张清单。
          return items.isSuccess ? (
            <p role="alert" className="mt-4 text-sm text-ink-muted">
              This item is not here any more.
            </p>
          ) : null
        })()}

      {finished.length > 0 && (
        <div className="mt-8">
          <button
            type="button"
            aria-pressed={showFinished}
            onClick={() => setShowFinished((v) => !v)}
            className="rounded-lg text-sm text-ink-muted hover:text-ink"
          >
            Finished <span className="tabular-nums">{finished.length}</span>
          </button>
          {showFinished && (
            <ul className={`mt-1 ${LIST_MEASURE}`}>
              {finished.map((item) => (
                <ReadingRow
                  key={item.id}
                  item={item}
                  timeZone={timeZone}
                  onOpen={() => navigate(`/reading/${item.id}`)}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {items.isSuccess && rows.length > 0 && open.length === 0 && finished.length > 0 && (
        <p className="mt-8 text-ink-muted">You are through the list.</p>
      )}
    </>
  )
}
