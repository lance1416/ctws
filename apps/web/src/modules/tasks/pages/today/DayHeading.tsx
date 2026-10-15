import { useQuery } from '@tanstack/react-query'
import { HANG } from '../../../../platform/ui/hang'
import { calendarDaysQuery } from '../../../../shell/calendar/api'

/**
 * THE DATE IS THE HEADING: this page is a day, and which one is the first thing it says. The
 * display step at 500, set back where the titles start; beside it the day's lunar name, a step
 * quieter, from the source the Calendar grid uses.
 */
export function DayHeading({
  now,
  today,
  timeZone,
}: {
  now: Date
  today: string
  timeZone: string
}) {
  const lunar = useQuery(calendarDaysQuery({ from: today, to: today }))
  const date = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone,
  }).format(now)
  return (
    <div className={`mb-8 ${HANG} flex flex-wrap items-baseline gap-x-4`}>
      <h1
        id="today-heading"
        tabIndex={-1}
        className="text-display font-medium tracking-[-0.022em] focus:outline-none max-sm:text-xl max-sm:font-semibold max-sm:tracking-normal"
      >
        {date}
      </h1>
      {lunar.data?.[today] && (
        <span data-lunar-day className="text-ink-subtle">
          {lunar.data[today]}
        </span>
      )}
    </div>
  )
}
