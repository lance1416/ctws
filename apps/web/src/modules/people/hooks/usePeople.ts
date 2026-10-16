import { useQuery } from '@tanstack/react-query'
import { peopleQuery } from '../api'

/** Everyone, by name: the list other modules pick people from (a meeting's attendees). */
export const usePeople = () => useQuery(peopleQuery())
