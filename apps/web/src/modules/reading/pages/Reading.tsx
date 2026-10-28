import { ModuleEmpty, useSubjectOf } from '../../../shell/layout'
import { idFrom, personId, type ReadingStatus } from '@ctws/contracts'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { DeletedNotice, useOpenFromUrl } from '../../../shell/detail'
import { readingQuery } from '../api'
import { isToRead, readingLabel } from '../logic/item'
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
  const [params] = useSearchParams()
  const recommender = params.get('recommendedBy')
  const by = recommender
    ? { id: idFrom(personId, recommender), name: params.get('by') ?? 'them' }
    : null
  // An item has no page of its own: `/reading/<id>` opens it over this list.
  const { openId, open, gone, show, close } = useOpenFromUrl({
    list: items,
    idOf: (i) => i.id,
    type: 'reading',
    base: '/reading',
  })
  useSubjectOf(open ? { type: 'reading', id: open.id, title: readingLabel(open) } : null)
  const [showFinished, setShowFinished] = useState(false)
  // The empty page's New: the add field, focused, until the first item is in.
  const [adding, setAdding] = useState(false)
  const addField = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (adding) addField.current?.querySelector('input')?.focus()
  }, [adding])
  const timeZone = useTimeZone()
  const today = ymd(useNow(), timeZone)

  const rows = items.data ?? []
  const of = (status: ReadingStatus) => rows.filter((i) => i.status === status)
  // Finished and dropped share a section: the difference matters when deciding, not afterwards.
  const finished = rows.filter((i) => !isToRead(i))
  const unfinished = rows.filter(isToRead)

  // An old address to something deleted: the main area is what happened to it.
  if (gone && openId) return <DeletedNotice type="reading" id={openId} />
  // Nothing yet: the badge, a line and the button, nothing else (FR-030, artboard 23).
  if (items.isSuccess && rows.length === 0 && !adding)
    return <ModuleEmpty kind="reading" onNew={() => setAdding(true)} />

  return (
    <>
      <PageHead hang>Reading</PageHead>

      <div ref={addField} className={`mt-4 ${HANG} max-w-[52ch]`}>
        <AddReading recommendedBy={by} />
      </div>

      <QueryStatus query={items} />

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
