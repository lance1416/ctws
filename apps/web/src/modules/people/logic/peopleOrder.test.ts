import type { PersonResponse } from '@ctws/contracts'
import { describe, expect, it } from 'vitest'
import { sortByFiled } from './peopleOrder'

const person = (name: string, givenName: string, familyName: string | null, id = name) =>
  ({ id, name, givenName, familyName }) as PersonResponse

describe('sortByFiled', () => {
  it('puts Chinese family names in pinyin order, not byte order', () => {
    // By code point Zhang sorts before Li and Wang; in pinyin it is Li, Wang, Zhang.
    const sorted = sortByFiled([
      person('王五', '五', '王'),
      person('李四', '四', '李'),
      person('张三', '三', '张'),
    ])
    expect(sorted.map((p) => p.name)).toEqual(['李四', '王五', '张三'])
  })

  // The browser's Chinese collation puts the Han names first within a letter, each by pinyin.
  it('orders by the family name, then the given name, ignoring case', () => {
    const people = [
      person('Ada Lovelace', 'Ada', 'Lovelace'),
      person('李四', '四', '李'),
      person('bob lee', 'bob', 'lee'),
      person('Lena', 'Lena', null),
    ]
    expect(sortByFiled(people).map((p) => p.name)).toEqual([
      '李四',
      'bob lee',
      'Lena',
      'Ada Lovelace',
    ])
  })

  it('breaks a tie by id, so the order never flickers between renders', () => {
    const sorted = sortByFiled([person('同名', '名', '同', 'b'), person('同名', '名', '同', 'a')])
    expect(sorted.map((p) => p.id)).toEqual(['a', 'b'])
  })

  it('does not sort the array it was given', () => {
    // It comes from the query cache; sorting in place would reorder what every other reader sees.
    const input = [person('乙', '乙', null), person('甲', '甲', null)]
    sortByFiled(input)
    expect(input.map((p) => p.name)).toEqual(['乙', '甲'])
  })
})
