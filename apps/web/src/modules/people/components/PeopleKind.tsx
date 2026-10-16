import { useQuery } from '@tanstack/react-query'
import { countdownPhrase } from '../../../platform/time/dates'
import { birthdaysQuery } from '../api'
import { usePeople } from '../hooks/usePeople'

/** Things' count for people: everyone, zero included. */
export function PeopleCount() {
  const people = usePeople()
  if (!people.data) return null
  const n = people.data.length
  return (
    <span data-count>
      {n} {n === 1 ? 'person' : 'people'}
    </span>
  )
}

/** Whose birthday is next, if anyone's is recorded. */
export function NextBirthdayLine() {
  const view = useQuery(birthdaysQuery())
  const next = view.data ? [...view.data.coming, ...view.data.later][0] : undefined
  if (!next) return null
  // No punctuation after the name: a Han name would get the engine's Han-Latin gap before a comma.
  return (
    <span data-status>
      Next birthday: {next.name} {countdownPhrase(next.inDays)}
    </span>
  )
}
