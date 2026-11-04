import type { FileId, UpdateMeBody, UserId } from '@ctws/contracts'
import { displayName, type NameParts } from '@ctws/core'
import { eq } from 'drizzle-orm'
import type { Db, Queryable } from '../../platform/db/client'
import { isUniqueViolation } from '../../platform/db/sql'
import { NameRequiredError, UsernameTakenError } from './errors'
import { users } from './tables'

/** Who the account says it is: its name in parts, its handle and its photo. */
export type Profile = {
  name: string | null
  givenName: string | null
  middleName: string | null
  familyName: string | null
  username: string | null
  avatarId: FileId | null
}

type Parts = Pick<Profile, 'givenName' | 'middleName' | 'familyName'>

/** The name as a person's would be shown, or null with no part given. */
function shown(parts: Parts): string | null {
  if (!parts.givenName && !parts.middleName && !parts.familyName) return null
  const asPerson: NameParts = {
    givenName: parts.givenName ?? '',
    middleName: parts.middleName,
    familyName: parts.familyName,
  }
  return displayName(asPerson)
}

export async function profileOf(db: Queryable, userId: UserId): Promise<Profile> {
  const [row] = await db
    .select({
      givenName: users.givenName,
      middleName: users.middleName,
      familyName: users.familyName,
      username: users.username,
      avatarId: users.avatarId,
    })
    .from(users)
    .where(eq(users.id, userId))
  const parts = row ?? {
    givenName: null,
    middleName: null,
    familyName: null,
    username: null,
    avatarId: null,
  }
  return { ...parts, name: shown(parts) }
}

/**
 * Changes what the patch names of the name and the handle. A name, once touched, has at least one
 * part: emptying all three is refused, not obeyed. A handle another account holds is refused by
 * the unique index, which also decides two accounts taking the same one at once.
 */
export async function setProfile(
  db: Db,
  userId: UserId,
  patch: Pick<UpdateMeBody, 'givenName' | 'middleName' | 'familyName' | 'username'>,
): Promise<void> {
  const set = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))
  if (Object.keys(set).length === 0) return
  await db.transaction(async (tx) => {
    const touchesName = ['givenName', 'middleName', 'familyName'].some((k) => k in set)
    if (touchesName) {
      const [now] = await tx
        .select({ g: users.givenName, m: users.middleName, f: users.familyName })
        .from(users)
        .where(eq(users.id, userId))
        .for('update')
      const after = {
        givenName: patch.givenName === undefined ? (now?.g ?? null) : patch.givenName,
        middleName: patch.middleName === undefined ? (now?.m ?? null) : patch.middleName,
        familyName: patch.familyName === undefined ? (now?.f ?? null) : patch.familyName,
      }
      if (shown(after) === null) throw new NameRequiredError()
    }
    try {
      await tx.update(users).set(set).where(eq(users.id, userId))
    } catch (error) {
      if (isUniqueViolation(error)) throw new UsernameTakenError()
      throw error
    }
  })
}
