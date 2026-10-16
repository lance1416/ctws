import { describe, expect, it } from 'vitest'
import { ancestorsOf } from './ancestors'

const n = (id: string, parentId: string | null) => ({ id, parentId })

describe('ancestorsOf', () => {
  it('returns the parents nearest first', () => {
    const nodes = [n('a', null), n('b', 'a'), n('c', 'b'), n('d', 'c')]
    expect(ancestorsOf(nodes, 'd')).toEqual(['c', 'b', 'a'])
  })

  it('returns nothing for a root task', () => {
    expect(ancestorsOf([n('a', null), n('b', 'a')], 'a')).toEqual([])
  })

  it('returns nothing for an id that is not in the list', () => {
    expect(ancestorsOf([n('a', null)], 'zz')).toEqual([])
  })

  it('stops at a parent that is absent from the list, as flatten does', () => {
    expect(ancestorsOf([n('b', 'gone'), n('c', 'b')], 'c')).toEqual(['b'])
  })

  it('does not hang on a parent cycle', () => {
    const nodes = [n('a', 'c'), n('b', 'a'), n('c', 'b')]
    expect(ancestorsOf(nodes, 'b')).toEqual(['a', 'c'])
  })

  it('does not hang on a node that is its own parent', () => {
    expect(ancestorsOf([n('a', 'a')], 'a')).toEqual([])
  })
})
