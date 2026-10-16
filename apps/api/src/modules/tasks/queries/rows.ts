import { z } from 'zod'
import { columnShape, columnsOf } from '../../../platform/db/raw'
import { tasks } from '../tables'

/** Every task column under the alias `t`, each named by its field. */
export const TASK_COLUMNS = columnsOf(tasks, 't')

/** A task read by raw SQL, with its project and parent named as `projectName` and `parentTitle`. */
export const taskRow = z.object({
  ...columnShape(tasks),
  projectName: z.string(),
  parentTitle: z.string().nullable(),
})
