import { useQuery } from '@tanstack/react-query'
import { readingQuery } from '../api'
import { isToRead } from '../logic/item'

/** "4 to read", for Things' count and the Workbench card's corner; null until loaded. */
export function useToReadCount(): string | null {
  const items = useQuery(readingQuery())
  return items.data ? `${items.data.filter(isToRead).length} to read` : null
}
