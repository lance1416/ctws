import { api } from '@ctws/contracts'
import { call } from '../../../platform/http/api'

/** Newest first; the server decides each task's day and whether this is the whole history. */
export const listCompleted = () => call(api.tasks.completed)
