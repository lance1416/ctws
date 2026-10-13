import type { Role } from '@ctws/contracts'

/** Instance roles: admin > maintainer > member; maintainer grants nothing beyond member yet. */
const RANK: Record<Role, number> = { member: 0, maintainer: 1, admin: 2 }

export function hasRole(actual: Role, minimum: Role): boolean {
  return RANK[actual] >= RANK[minimum]
}
