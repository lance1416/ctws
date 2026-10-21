import type { ReadingStatus } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { GoneNotice, useOpenFromUrl } from '../../../shell/detail'
import { readingQuery } from '../api'
import { isToRead } from '../logic/item'
import { EmptyState } from '../../../platform/ui/EmptyState'
import { DaySection, LIST_MEASURE, ROW_LIST } from '../../../shell/rows'
import { AddReading } from '../components/AddReading'
import { ReadingDetail } from '../components/ReadingDetail'
import { ReadingRow } from '../components/ReadingRow'
import { useTimeZone } from '../../../shell/auth'
import { useNow } from '../../../platform/time/useNow'
import { ymd } from '../../../platform/time/dates'
import { QueryStatus } from '../../../platform/ui/QueryStatus'
import { PageHead } from '../../../platform/ui/PageHead'
import { HANG } from '../../../platform/ui/hang'

/** Sections by status, not by kind; what you are reading now comes first. */
const SECTIONS: { status: ReadingStatus; label: string }[] = [
  { status: 'reading', label: 'Reading now' },
  { status: 'todo', label: 'To read' },
]

export function Reading() {
  const items = useQuery(readingQuery())
  // An item has no page of its own: `/reading/<id>` opens it over this list.
  const { open, gone, show, close } = useOpenFromUrl({
    list: items,
    idOf: (i) => i.id,
    type: 'reading',
    base: '/reading',
  })
  const [showFinished, setShowFinished] = useState(false)
  const timeZone = useTimeZone()
  const today = ymd(useNow(), timeZone)

  const rows = items.data ?? []
  const of = (status: ReadingStatus) => rows.filter((i) => i.status === status)
  // Finished and dropped share a section: the difference matters when deciding, not afterwards.
  const finished = rows.filter((i) => !isToRead(i))
  const unfinished = rows.filter(isToRead)

  return (
    <>
      <PageHead hang>Reading</PageHead>

      <div className={`mt-4 ${HANG} max-w-[52ch]`}>
        <AddReading />
      </div>

      <QueryStatus query={items} />
      {items.isSuccess && rows.length === 0 && <EmptyState hang title="The list is empty" />}

      {SECTIONS.map(({ status, label }) => {
        const section = of(status)
        if (section.length === 0) return null
        return (
          <DaySection
            key={status}
            label={label}
            count={section.length}
            className={`mt-8 ${LIST_MEASURE}`}
          >
            <ul className={ROW_LIST}>
              {section.map((item) => (
                <ReadingRow key={item.id} item={item} today={today} onOpen={() => show(item.id)} />
              ))}
            </ul>
          </DaySection>
        )
      })}

      {open && <ReadingDetail key={open.id} item={open} onClose={close} />}
      {gone && <GoneNotice kind="item" />}

      {finished.length > 0 && (
        <div className={`mt-8 ${LIST_MEASURE}`}>
          <button
            type="button"
            aria-pressed={showFinished}
            onClick={() => setShowFinished((v) => !v)}
            className={`${HANG} rounded-control text-ui text-muted hover:text-ink`}
          >
            Finished <span className="tabular-nums">{finished.length}</span>
          </button>
          {showFinished && (
            <ul className={`mt-1 ${ROW_LIST}`}>
              {finished.map((item) => (
                <ReadingRow key={item.id} item={item} today={today} onOpen={() => show(item.id)} />
              ))}
            </ul>
          )}
        </div>
      )}

      {items.isSuccess && rows.length > 0 && unfinished.length === 0 && finished.length > 0 && (
        <p className={`mt-8 ${HANG} text-muted`}>You are through the list.</p>
      )}
    </>
  )
}
