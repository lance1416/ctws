import { clockTime } from '@ctws/core/clock'
import { useRef, type ReactNode } from 'react'
import { longDay, ymd } from '../../platform/time/dates'
import { useNow } from '../../platform/time/useNow'
import { Block } from '../../platform/ui/Block'
import { useColumns } from '../../platform/ui/columns'
import { KIND_ICON, MusicIcon, WeatherIcon } from '../../platform/ui/icons'
import { useTimeZone } from '../auth'
import { MovedPrompt } from '../account'
import { useRegistry } from '../registry'
import { arrangement, type Place } from './arrangement'
import { FixedPlaces } from './fit'
import { Launcher } from './Launcher'
import { NextSevenDays } from './NextSevenDays'

/**
 * THE WORKBENCH (FR-075, artboards 10 and 22): where the day starts. Today's date and the time;
 * then a fixed arrangement of widgets, each doing one thing: what is in hand, the launcher, the
 * next meetings, who owes a reply, birthdays, reading, the week. No editing of the arrangement
 * this round, and no widget scrolls.
 */
export function Workbench() {
  const zone = useTimeZone()
  const now = useNow()
  const page = useRef<HTMLDivElement>(null)
  const columns = useColumns(page)
  const { grid, places } = arrangement(columns)
  const widgets = useRegistry().widgets
  const own: Record<Exclude<Place, keyof typeof widgets>, ReactNode> = {
    launcher: <Launcher tall={columns >= 6} />,
    week: <NextSevenDays />,
    quickNote: <Later title="Quick note" kind="note" />,
    weather: <Later title="Weather" icon={WeatherIcon} />,
    music: <Later title="Music" icon={MusicIcon} />,
  }

  return (
    <div ref={page} className="flex min-h-full w-full flex-1 flex-col gap-4">
      <div className="flex items-baseline gap-4">
        <h1 tabIndex={-1} className="text-title tracking-[-0.01em] text-ink focus:outline-none">
          {longDay(ymd(now, zone))}
        </h1>
        {/* The clock as Today's head has it. */}
        <span className="font-mono text-ui text-muted tabular-nums">{clockTime(now, zone)}</span>
      </div>
      <MovedPrompt />
      <FixedPlaces.Provider value={columns > 1}>
        <div data-workbench-columns={columns} className="grid flex-1 gap-3" style={grid}>
          {places.map(({ place, style }) => {
            const module = widgets[place as keyof typeof widgets]
            const body = module ? <module.Component /> : own[place as keyof typeof own]
            if (!body) return null
            return (
              <div
                key={place}
                data-place={place}
                style={style}
                className="flex min-h-0 min-w-0 flex-col *:min-h-0 *:flex-1"
              >
                {body}
              </div>
            )
          })}
        </div>
      </FixedPlaces.Provider>
    </div>
  )
}

/** Not built this round (FR-077): its head and what it will be, nothing to press. */
function Later({ title, kind, icon }: { title: string; kind?: 'note'; icon?: typeof WeatherIcon }) {
  return (
    <Block
      title={title}
      {...(kind
        ? { kind }
        : { badge: { icon: icon ?? KIND_ICON.note, tint: 'bg-hover text-muted' } })}
      empty="Coming later"
    />
  )
}
