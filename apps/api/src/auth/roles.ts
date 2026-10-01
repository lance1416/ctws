import type { Role } from '@ctws/contracts'

// Instance roles (users.role): who may administer this instance. Ordered admin > maintainer > member.
// This is NOT the workspace role (workspace_members.role), which governs access to a workspace's
// contents and is not enforced anywhere yet. An admin gets no access to other users' workspace data.
//
// `maintainer` is defined but currently grants nothing beyond `member`: there is no maintenance
// surface (admin UI, job inspection, session pruning) for it to unlock. Do not give it a
// capability until such a surface exists. tests/admin.test.ts pins that a maintainer gets 403
// from the admin endpoints, so changing that boundary has to be deliberate.
const RANK: Record<Role, number> = { member: 0, maintainer: 1, admin: 2 }

export function hasRole(actual: Role, minimum: Role): boolean {
  return RANK[actual] >= RANK[minimum]
}
