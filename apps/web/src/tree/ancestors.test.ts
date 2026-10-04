import { describe, expect, it } from 'vitest'
import { ancestorsOf } from './ancestors'

const n = (id: string, parentId: string | null) => ({ id, parentId })

describe('ancestorsOf', () => {
  it('returns the parents nearest first', () => {
    const nodes = [n('a', null), n('b', 'a'), n('c', 'b'), n('d', 'c')]
    // Nearest-first and complete: an order-insensitive assertion would pass for a function that
    // returned the chain upside down, which would still unfold the right rows and so hide the bug
    // from every caller except the next one.
    expect(ancestorsOf(nodes, 'd')).toEqual(['c', 'b', 'a'])
  })

  it('returns nothing for a root task', () => {
    expect(ancestorsOf([n('a', null), n('b', 'a')], 'a')).toEqual([])
  })

  it('returns nothing for an id that is not in the list', () => {
    expect(ancestorsOf([n('a', null)], 'zz')).toEqual([])
  })

  it('stops at a parent that is absent from the list, as flatten does', () => {
    // `flatten` renders such a node as a root, so there is no row for the missing parent to
    // unfold; carrying on up would ask the tree to expand something it never drew.
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
