import { useQuery } from '@tanstack/react-query'
import { readingQuery } from '../api'
import { isToRead } from '../logic/item'

/** What is to read but filed nowhere, if any. */
export function UnfiledLine() {
  const unfiled = useQuery(readingQuery({ unfiled: true }))
  const count = unfiled.data?.filter(isToRead).length ?? 0
  return count > 0 ? <span data-status>{count} not in a project</span> : null
}
