import { api } from '@ctws/contracts'
import { call } from '../../../platform/http/api'

// The server owns the matching and the order; nothing here re-ranks or re-filters.
export const searchTasks = async (q: string) =>
  (await call(api.tasks.search, { query: { q } })).tasks
