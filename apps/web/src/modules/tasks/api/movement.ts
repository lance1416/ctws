import { api } from '@ctws/contracts'
import { call } from '../../../platform/http/api'

/** Every number is the server's, computed in the user's timezone; nothing is re-derived here. */
export const listMovement = async () => (await call(api.tasks.movement)).projects
