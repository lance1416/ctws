import { idFrom } from '@ctws/contracts'
import { v7 as uuidv7 } from 'uuid'

/**
 * A new row's id, of the kind `schema` names. Version 7 is time-ordered, so new rows land at the
 * end of the primary key's index.
 */
export const newId = <Schema extends Parameters<typeof idFrom>[0]>(schema: Schema) =>
  idFrom(schema, uuidv7())
