import { describe, expect, it } from 'vitest'
import { depthOf, freeName, heightOf, mayGoInto, subtreeOf } from './folders'

const tree = [
  { id: 'a', parentId: null },
  { id: 'b', parentId: 'a' },
  { id: 'c', parentId: 'b' },
  { id: 'd', parentId: null },
  { id: 'e', parentId: 'd' },
]

describe('folders of notes, three deep', () => {
  it('know how deep each sits and how many levels each holds', () => {
    expect([depthOf(tree, 'a'), depthOf(tree, 'b'), depthOf(tree, 'c')]).toEqual([1, 2, 3])
    expect([heightOf(tree, 'a'), heightOf(tree, 'd'), heightOf(tree, 'c')]).toEqual([3, 2, 1])
    expect([...subtreeOf(tree, 'a')].sort()).toEqual(['a', 'b', 'c'])
  })

  it('take a folder only where it and all it holds stay three deep, never under itself', () => {
    expect(mayGoInto(tree, 'e', 'b')).toBe(true)
    expect(mayGoInto(tree, 'd', 'a')).toBe(true)
    expect(mayGoInto(tree, 'd', 'b')).toBe(false)
    expect(mayGoInto(tree, 'a', 'c')).toBe(false)
    expect(mayGoInto(tree, 'a', 'a')).toBe(false)
    expect(mayGoInto(tree, 'c', null)).toBe(true)
  })

  it('keep a name moving up, or take the first number free', () => {
    expect(freeName('Talks', new Set(['Ideas']))).toBe('Talks')
    expect(freeName('Talks', new Set(['Talks']))).toBe('Talks 2')
    expect(freeName('Talks', new Set(['Talks', 'Talks 2']))).toBe('Talks 3')
  })
})
