import { describe, expect, it } from 'vitest'
import { sortByName } from './contactOrder'

const person = (name: string, id = name) =>
  ({ id, name }) as unknown as Parameters<typeof sortByName>[0][number]

describe('sortByName', () => {
  it('puts Chinese names in pinyin order, not byte order', () => {
    // 陈 is c, 老 is l, 阿 is a. A plain sort orders them by code point: 陈(9648) 老(32769) 阿(38463),
    // which happens to look right here and is wrong as soon as a 王 shows up before a 李.
    const sorted = sortByName([person('王五'), person('李四'), person('张三')])
    expect(sorted.map((p) => p.name)).toEqual(['李四', '王五', '张三'])
  })

  it('ignores case, so a list is not split into two alphabets', () => {
    expect(sortByName([person('zoe'), person('Adam'), person('mina')]).map((p) => p.name)).toEqual([
      'Adam',
      'mina',
      'zoe',
    ])
  })

  it('breaks a tie by id, so the order never flickers between renders', () => {
    const sorted = sortByName([person('同名', 'b'), person('同名', 'a')])
    expect(sorted.map((p) => p.id)).toEqual(['a', 'b'])
  })

  it('does not sort the array it was given', () => {
    // It comes from the query cache; sorting in place would reorder what every other reader sees.
    const input = [person('乙'), person('甲')]
    sortByName(input)
    expect(input.map((p) => p.name)).toEqual(['乙', '甲'])
  })
})
