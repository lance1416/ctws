import type { ComponentType, ReactNode } from 'react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Avatar } from '../../platform/ui/Avatar'
import { ForwardIcon, KIND_ICON, PLACE_ICON, type IconComponent } from '../../platform/ui/icons'
import { KIND_TEXT } from '../../platform/ui/kinds'
import { useMe } from '../auth/useMe'
import { ProjectSquare, useProjects } from '../projects'
import { useRegistry } from '../registry'
import { SearchDialog } from '../search/SearchDialog'
import { PhoneHead } from './PhoneHead'

/**
 * MORE (FR-085, artboard 25): everything a phone has no tab for. Search on top; the pages across
 * kinds (Workbench, Review); every other kind, each with what is worth knowing of it; each
 * project, with how many open leaves it has; and the account last.
 */
export function More() {
  const registry = useRegistry()
  const [searching, setSearching] = useState(false)
  const projects = (useProjects().data ?? []).filter((p) => !p.isInbox)
  const me = useMe().data
  const review = registry.pinned.find((p) => p.to === '/review')
  // Today and People have tabs of their own; tasks live on Today.
  const kinds = registry.kinds.filter((k) => !['/today', '/people'].includes(k.to))
  const iconOf = (label: string) => {
    const relation = registry.relations.find((r) => r.plural === label)
    return relation
      ? { icon: KIND_ICON[relation.type as keyof typeof KIND_ICON], type: relation.type }
      : null
  }
  return (
    <div className="flex flex-col gap-4">
      <PhoneHead title="More" />
      <button
        type="button"
        onClick={() => setSearching(true)}
        className="flex h-11 items-center gap-2.5 rounded-card bg-hover px-3 text-left text-prose text-subtle"
      >
        <PLACE_ICON.search size={18} aria-hidden="true" />
        Search everything
      </button>

      <Group title="Pages">
        <Row to="/" icon={PLACE_ICON.workbench} label="Workbench" />
        {review && (
          <Row
            to={review.to}
            icon={PLACE_ICON.review}
            label={review.label}
            Count={review.MoreCount}
          />
        )}
      </Group>

      <Group title="Everything else">
        {kinds.map((k) => {
          const look = iconOf(k.label)
          return (
            <Row
              key={k.to}
              to={k.to}
              icon={look?.icon ?? KIND_ICON.project}
              tone={
                look
                  ? (KIND_TEXT[look.type as keyof typeof KIND_TEXT] ?? 'text-muted')
                  : 'text-muted'
              }
              label={k.label}
              Count={k.MoreCount ?? k.Count}
            />
          )
        })}
      </Group>

      {projects.length > 0 && (
        <Group title="Projects">
          {projects.map((p) => (
            <li key={p.id}>
              <Link to={`/projects/${p.id}`} className={ROW}>
                <ProjectSquare project={p} />
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                {registry.projectCount && (
                  <span className="text-ui text-muted tabular-nums">
                    {registry.projectCount(p)}
                  </span>
                )}
                <ForwardIcon size={16} aria-hidden="true" className="text-subtle" />
              </Link>
            </li>
          ))}
        </Group>
      )}

      <Group>
        <li>
          <Link to="/account" className={ROW}>
            <Avatar initials={me?.email.slice(0, 1).toUpperCase() ?? null} />
            <span className="min-w-0 flex-1 truncate">Account and time zone</span>
            <ForwardIcon size={16} aria-hidden="true" className="text-subtle" />
          </Link>
        </li>
      </Group>

      {searching && <SearchDialog onClose={() => setSearching(false)} />}
    </div>
  )
}

const ROW =
  'flex min-h-12 items-center gap-3 border-b border-line px-3.5 text-row text-ink last:border-b-0 hover:bg-hover'

function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section aria-label={title ?? 'Account'} className="flex flex-col gap-1.5">
      {title && <h2 className="px-1 text-ui font-medium text-muted">{title}</h2>}
      <ul className="overflow-hidden rounded-phone-card border border-line bg-panel [&>li:last-child>a]:border-b-0">
        {children}
      </ul>
    </section>
  )
}

function Row({
  to,
  icon: Icon,
  tone = 'text-muted',
  label,
  Count,
}: {
  to: string
  icon: IconComponent
  tone?: string
  label: string
  Count?: ComponentType | undefined
}) {
  return (
    <li>
      <Link to={to} className={ROW}>
        <Icon size={20} aria-hidden="true" className={`shrink-0 ${tone}`} />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {Count && (
          <span className="text-ui text-muted tabular-nums">
            <Count />
          </span>
        )}
        <ForwardIcon size={16} aria-hidden="true" className="text-subtle" />
      </Link>
    </li>
  )
}
