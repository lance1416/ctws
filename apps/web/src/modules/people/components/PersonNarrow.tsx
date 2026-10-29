import { avatarInitials } from '@ctws/core'
import { calledBy } from '../logic/calledBy'
import { useNow } from '../../../platform/time/useNow'
import { Avatar } from '../../../platform/ui/Avatar'
import {
  CakeIcon,
  ContactIcon,
  DurationIcon,
  KIND_ICON,
  PlacesIcon,
} from '../../../platform/ui/icons'
import { useTimeZone } from '../../../shell/auth'
import {
  InspectLink,
  NarrowBlocks,
  NarrowHead,
  useListAct,
  PropRow,
  PropRows,
  useNarrowKindBlocks,
} from '../../../shell/inspector'
import { useRegistry } from '../../../shell/registry'
import { Timeline } from '../../../shell/timeline'
import { usePeople } from '../hooks/usePeople'
import { byKind, channelHref, channelLabel } from '../logic/channels'
import { PEOPLE_ID } from '../logic/id'
import { theirTime } from '../logic/localTime'
import { cityAndCountry } from '../logic/places'

/** A birthday this near is a tag under the name, as on the full page. */
const SOON_DAYS = 30
const TAG = 'inline-flex h-5.5 items-center gap-1 rounded-key px-2 font-medium'

/**
 * A PERSON IN THE INSPECTOR (FR-022, artboard 33): their face and name, where they work and a
 * birthday that is near; how to reach them, where they live and their time; then what they are
 * in, a block each, and the latest of their timeline.
 */
export function PersonNarrow({ id }: { id: string }) {
  const people = usePeople()
  const registry = useRegistry()
  const now = useNow()
  const mine = useTimeZone()
  const person = people.data?.find((p) => p.id === id)
  const owned = registry.personThings.map((t) => ({ kind: t.kind, ...t.useThings(id as never) }))
  const page = `/${PEOPLE_ID}/${id}`
  const blocks = useNarrowKindBlocks({
    of: { type: 'person', id },
    kinds: (['meeting', 'task', 'reading'] as const).filter((k) =>
      registry.relations.some((r) => r.type === k),
    ),
    owned,
    fullPage: page,
    titles: { reading: 'Reading' },
    none: (kind) => (kind === 'reading' ? 'None from them yet' : 'None with them yet'),
    linkedRows: registry.personLinked,
  })
  const act = useListAct()
  if (people.isSuccess && !person)
    return <p className="p-4 text-ui text-muted">This person is not here any more.</p>
  if (!person) return null
  const work = person.roles.filter((r) => r.to === null)
  const email = byKind(person.channels).find((c) => c.kind === 'email')
  const soon = person.birthday && person.birthday.next.inDays <= SOON_DAYS ? person.birthday : null
  return (
    <>
      <NarrowHead
        mark={<Avatar initials={avatarInitials(person)} size={40} />}
        title={person.name}
        tags={
          <>
            {work.map((r) => (
              <span key={r.organisationId} className="inline-flex items-center gap-1.5 text-muted">
                {r.title && <span>{r.title}</span>}
                <InspectLink
                  thing={{ type: 'organisation', id: r.organisationId }}
                  to={`/organisations/${r.organisationId}`}
                  className={`${TAG} bg-organisation-bg text-organisation-t hover:underline`}
                >
                  <KIND_ICON.organisation size={12} aria-hidden="true" />
                  {r.organisationName}
                </InspectLink>
              </span>
            ))}
            {soon && (
              <span className={`${TAG} bg-person-bg text-person-t`}>
                <CakeIcon size={12} aria-hidden="true" />
                {soon.next.inDays === 0 ? 'Today' : `In ${soon.next.inDays} days`}
              </span>
            )}
          </>
        }
      />
      <PropRows>
        <PropRow icon={ContactIcon} label="Email">
          {email && (
            <a href={channelHref(email.kind, email.value)} className="hover:underline">
              {channelLabel(email.kind, email.value)}
            </a>
          )}
        </PropRow>
        <PropRow icon={PlacesIcon} label="Lives in">
          {person.city && cityAndCountry(person.city)}
        </PropRow>
        <PropRow icon={DurationIcon} label="Local time">
          {person.timeZone && (
            <span className="font-mono tabular-nums">{theirTime(now, person.timeZone, mine)}</span>
          )}
        </PropRow>
      </PropRows>
      <NarrowBlocks
        blocks={[
          ...blocks,
          {
            key: 'timeline',
            title: 'Timeline',
            last: true,
            body: (
              <Timeline
                of={{ type: 'person', id }}
                last={5}
                everything={{ label: `Everything with ${calledBy(person)}`, to: page }}
              />
            ),
          },
        ]}
      />
      {/* What the block it was opened from offers: Remove from Job hunt (DES-001). */}
      {act && <div className="px-4 pt-2 pb-4">{act}</div>}
    </>
  )
}
