import type { OrganisationId, PersonId } from '@ctws/contracts'
import { avatarInitials } from '@ctws/core'
import { useId, useRef, useState } from 'react'
import { useComposing } from '../../../platform/keyboard/composition'
import { Avatar } from '../../../platform/ui/Avatar'
import { boxed } from '../../../platform/ui/formStyles'
import { CloseIcon, KIND_ICON } from '../../../platform/ui/icons'
import { LAYER } from '../../../platform/ui/layers'
import { OrganisationMark, useOrganisations } from '../../organisations'
import { usePeople } from '../../people'

/** One of those a message was with, as the form holds it. */
export type Party =
  | { type: 'person'; id: PersonId; name: string }
  | { type: 'organisation'; id: OrganisationId; name: string }

/** How many matches the list offers while a name is typed. */
const OFFERED = 8

const same = (a: Party, b: Party) => a.type === b.type && a.id === b.id

/**
 * WHO A MESSAGE WAS WITH (FR-048, FR-070): people and organisations as chips, found by typing.
 * Choosing someone brings the organisations they work at now, once each; a chip goes with its ✕
 * or with Backspace in the empty box.
 */
export function PartyPicker({
  label,
  value,
  onChange,
  invalid = false,
}: {
  /** "To", or "From" for a received one. */
  label: string
  value: readonly Party[]
  onChange: (next: Party[]) => void
  invalid?: boolean
}) {
  const people = usePeople()
  const organisations = useOrganisations()
  const composing = useComposing()
  const [typed, setTyped] = useState('')
  const [at, setAt] = useState(0)
  const box = useRef<HTMLInputElement>(null)
  const listId = useId()
  const words = typed.trim().toLocaleLowerCase()
  const matches: Party[] =
    words === ''
      ? []
      : [
          ...(people.data ?? []).map((p): Party => ({ type: 'person', id: p.id, name: p.name })),
          ...(organisations.data ?? []).map((o): Party => ({
            type: 'organisation',
            id: o.id,
            name: o.name,
          })),
        ]
          .filter(
            (p) => p.name.toLocaleLowerCase().includes(words) && !value.some((v) => same(v, p)),
          )
          .slice(0, OFFERED)
  const active = Math.min(at, Math.max(matches.length - 1, 0))

  const choose = (party: Party) => {
    const next = [...value, party]
    if (party.type === 'person') {
      // Where they work now comes along, unless it is there already (FR-070).
      const person = people.data?.find((p) => p.id === party.id)
      for (const role of person?.roles.filter((r) => r.to === null) ?? []) {
        const org: Party = {
          type: 'organisation',
          id: role.organisationId,
          name: role.organisationName,
        }
        if (!next.some((v) => same(v, org))) next.push(org)
      }
    }
    onChange(next)
    setTyped('')
    setAt(0)
    box.current?.focus()
  }

  return (
    <div className="relative">
      <div
        onClick={() => box.current?.focus()}
        aria-invalid={invalid || undefined}
        className={`${boxed} flex h-auto min-h-9 flex-wrap items-center gap-1.5 py-1.5`}
      >
        {value.map((p) => (
          <PartyChip
            key={`${p.type}:${p.id}`}
            party={p}
            onRemove={() => onChange(value.filter((v) => !same(v, p)))}
          />
        ))}
        <input
          ref={box}
          role="combobox"
          aria-label={label}
          aria-expanded={matches.length > 0}
          aria-controls={listId}
          aria-activedescendant={matches.length > 0 ? `${listId}-${active}` : undefined}
          value={typed}
          onChange={(e) => {
            setTyped(e.target.value)
            setAt(0)
          }}
          {...composing.bind}
          onKeyDown={(e) => {
            if (composing.composingNow(e)) return
            if (e.key === 'ArrowDown' && matches.length > 0) {
              e.preventDefault()
              setAt((active + 1) % matches.length)
            } else if (e.key === 'ArrowUp' && matches.length > 0) {
              e.preventDefault()
              setAt((active - 1 + matches.length) % matches.length)
            } else if (e.key === 'Enter' && !(e.ctrlKey || e.metaKey) && matches[active]) {
              e.preventDefault()
              choose(matches[active])
            } else if (e.key === 'Backspace' && typed === '' && value.length > 0) {
              onChange(value.slice(0, -1))
            } else if (e.key === 'Escape' && typed !== '') {
              e.preventDefault()
              setTyped('')
            }
          }}
          placeholder={value.length === 0 ? 'A person or an organisation' : ''}
          data-bare
          className="min-w-24 flex-1 bg-transparent text-ui text-ink placeholder:text-subtle"
        />
      </div>
      {matches.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          aria-label={`${label}: matches`}
          className={`absolute inset-x-0 top-full ${LAYER.menu} mt-1 rounded-block bg-float py-1 shadow-float`}
        >
          {matches.map((p, i) => (
            <li
              key={`${p.type}:${p.id}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(p)}
              onMouseEnter={() => setAt(i)}
              className={`flex h-9 cursor-pointer items-center gap-2.5 px-3 text-ui text-ink ${
                i === active ? 'bg-select' : ''
              }`}
            >
              <PartyMark party={p} />
              <span className="truncate">{p.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function PartyMark({ party }: { party: Party }) {
  const people = usePeople()
  if (party.type === 'organisation') return <OrganisationMark name={party.name} />
  const person = people.data?.find((p) => p.id === party.id)
  return <Avatar initials={person ? avatarInitials(person) : ([...party.name][0] ?? '')} />
}

/** A party as a chip in its kind's colour, with the way to take it off. */
export function PartyChip({ party, onRemove }: { party: Party; onRemove?: () => void }) {
  const Icon = KIND_ICON[party.type]
  const tint =
    party.type === 'person'
      ? 'bg-person-bg text-person-t'
      : 'bg-organisation-bg text-organisation-t'
  return (
    <span
      className={`inline-flex h-6 max-w-full min-w-0 items-center gap-1 rounded-control pr-1 pl-2 text-meta font-medium ${tint}`}
    >
      <Icon size={12} aria-hidden="true" />
      <span className="truncate">{party.name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          aria-label={`Remove ${party.name}`}
          className="inline-grid size-4.5 place-items-center rounded-key hover:bg-hover"
        >
          <CloseIcon size={12} aria-hidden="true" />
        </button>
      )}
    </span>
  )
}
