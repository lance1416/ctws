import { isValidElement, type ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { describeOrganisationChange } from './describeChange'

/**
 * What a line says, read off its elements without drawing them: a label or a project is said by
 * its `name`, as a screen reader hears it.
 */
function words(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(words).join('')
  if (!isValidElement(node)) return ''
  const props = node.props as { name?: string; children?: ReactNode }
  return props.name ?? words(props.children)
}

const said = (type: string, payload: unknown) => {
  const line = describeOrganisationChange({ type, payload })
  return line ? words(line.text).replace(/\s+/g, ' ').trim() : undefined
}

describe('describeOrganisationChange', () => {
  it('says what happened to the organisation itself', () => {
    expect(said('created', { to: { name: 'Harbour & Lane LLP' } })).toBe('Added')
    expect(said('field_changed', { field: 'name', from: 'Harbour', to: 'Harbour & Lane' })).toBe(
      'Renamed from “Harbour”',
    )
    expect(said('field_changed', { field: 'city', from: null, to: 'London' })).toBe(
      'City set to London',
    )
    expect(said('field_changed', { field: 'type', from: 'Company', to: null })).toBe('Type cleared')
    expect(said('field_changed', { field: 'note', from: null, to: 'Fast' })).toBe('Notes changed')
    expect(said('merged', { from: { name: 'H&L' } })).toBe('“H&L” merged into it')
  })

  it('says where a node related to it moved, in which project (FR-065)', () => {
    expect(
      said('stage_changed', {
        from: 'Contacted',
        to: 'Shortlisted',
        taskTitle: 'Harbour & Lane',
        projectName: 'Find a lawyer',
      }),
    ).toBe('Stage Contacted → Shortlisted in Find a lawyer')
    expect(
      said('stage_changed', { from: null, to: 'Contacted', projectName: 'Find a lawyer' }),
    ).toBe('Stage set to Contacted in Find a lawyer')
    expect(
      said('stage_changed', { from: 'Contacted', to: null, projectName: 'Find a lawyer' }),
    ).toBe('Stage cleared in Find a lawyer')
  })

  it('says nothing of a change only its key made', () => {
    expect(
      said('field_changed', { field: 'cityKey', from: null, to: 'london|eng|gb' }),
    ).toBeUndefined()
    expect(said('something_new', {})).toBeUndefined()
  })
})
