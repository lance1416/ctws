import type { FileId, PersonId, WorkspaceId } from '@ctws/contracts'
import { eq, isNull } from 'drizzle-orm'
import { scoped, within } from '../../platform/db/scope'
import type { Holder } from '../../shell/files'
import { lockPerson } from './queries'
import { people } from './tables'

/** A person as the holder of their photo; one not in this workspace is a 404. */
export const personHolder = (workspaceId: WorkspaceId, id: PersonId): Holder => ({
  id,
  async swap(tx, next) {
    const current = await lockPerson(tx, workspaceId, id)
    await tx.update(people).set({ avatarId: next }).where(eq(people.id, id))
    return current.avatarId
  },
  async refill(tx, photo: FileId) {
    await lockPerson(tx, workspaceId, id)
    const done = await tx
      .update(people)
      .set({ avatarId: photo })
      .where(within(scoped(people, workspaceId), eq(people.id, id), isNull(people.avatarId)))
      .returning({ id: people.id })
    return done.length > 0
  },
})
