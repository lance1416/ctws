import { describe, expect, it } from 'vitest'
import { federate, type ProviderResult } from './search'

/**
 * Federation, exercised with two providers -- which is the only way to show it federates. Against
 * the single-module dialog this replaced, every one of these would be unanswerable.
 */
const hit = (id: string) => ({ id, to: `/x/${id}`, title: id, meta: id, mark: null })

const tasks = (ids: string[], over: Partial<ProviderResult> = {}): ProviderResult => ({
  moduleId: 'tasks',
  moduleLabel: 'Tasks',
  hits: ids.map(hit),
  isError: false,
  isSuccess: true,
  ...over,
})

const notes = (ids: string[], over: Partial<ProviderResult> = {}): ProviderResult => ({
  moduleId: 'notes',
  moduleLabel: 'Notes',
  hits: ids.map(hit),
  isError: false,
  isSuccess: true,
  ...over,
})

describe('federate', () => {
  it('merges the providers in order and stamps each row with its module', () => {
    const { rows } = federate([tasks(['a', 'b']), notes(['c'])])
    expect(rows.map((r) => r.id)).toEqual(['a', 'b', 'c'])
    expect(rows.map((r) => r.moduleId)).toEqual(['tasks', 'tasks', 'notes'])
    // The module is carried as its own NAME, so a row can say where it came from in text. Nothing
    // here is a colour: WCAG 1.4.1, the rule the redesign follows.
    expect(rows.map((r) => r.moduleLabel)).toEqual(['Tasks', 'Tasks', 'Notes'])
  })

  it('only asks a row to name its module when there is another module to confuse it with', () => {
    expect(federate([tasks(['a'])]).showModule).toBe(false)
    expect(federate([tasks(['a']), notes([])]).showModule).toBe(true)
  })

  it('reports one provider failure as a failure instead of a short list', () => {
    const half = federate([tasks(['a']), notes([], { isError: true, isSuccess: false })])
    expect(half.isError).toBe(true)
    // Not success: a half-answered search must never render "Nothing matches".
    expect(half.isSuccess).toBe(false)
    expect(half.rows).toHaveLength(1)
  })

  it('is not successful before any provider has answered', () => {
    expect(federate([tasks([], { isSuccess: false })]).isSuccess).toBe(false)
    expect(federate([]).isSuccess).toBe(false)
  })
})
