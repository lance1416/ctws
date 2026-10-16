import { useQuery } from '@tanstack/react-query'
import { longDay } from '../../../../platform/time/dates'
import { HANG } from '../../../../platform/ui/hang'
import { calendarDaysQuery } from '../../../../shell/calendar'

/** The date is the page's heading, with the day's lunar name beside it. */
export function DayHeading({ today }: { today: string }) {
  const lunar = useQuery(calendarDaysQuery({ from: today, to: today }))
  return (
    <div className={`mb-8 ${HANG} flex flex-wrap items-baseline gap-x-4`}>
      <h1
        id="today-heading"
        tabIndex={-1}
        className="text-display font-medium tracking-[-0.022em] focus:outline-none max-sm:text-xl max-sm:font-semibold max-sm:tracking-normal"
      >
        {longDay(today)}
      </h1>
      {lunar.data?.[today] && (
        <span data-lunar-day className="text-ink-subtle">
          {lunar.data[today]}
        </span>
      )}
    </div>
  )
}
