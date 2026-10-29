import type { BirthdayResponse, PersonResponse } from '@ctws/contracts'
import { derivedFacts } from './birthdays'
import type { PersonRow, StoredBirthday } from './queries'

/** The stored birthday with everything derived from it against `today`. */
function withFacts(b: StoredBirthday, today: string): BirthdayResponse {
  return { ...b, ...derivedFacts(b, b.hourBranch, today) }
}

export function toPersonResponse(p: PersonRow, today: string): PersonResponse {
  return {
    id: p.id,
    name: p.name,
    givenName: p.givenName,
    middleName: p.middleName,
    familyName: p.familyName,
    sortKey: p.sortKey,
    aliases: p.aliases,
    circleIds: p.circleIds,
    timeZone: p.timeZone,
    timeZoneSource: p.timeZoneSource,
    cityKey: p.cityKey,
    hometownKey: p.hometownKey,
    org: p.org,
    note: p.note,
    projects: p.projects.map((pr) => ({
      ...pr,
      lastActivityAt: pr.lastActivityAt?.toISOString() ?? null,
    })),
    channels: p.channels,
    birthday: p.birthday ? withFacts(p.birthday, today) : null,
    gender: p.gender,
    hometown: p.hometown,
    city: p.city,
    title: p.title,
    circle: p.circle,
    roles: p.roles,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }
}
