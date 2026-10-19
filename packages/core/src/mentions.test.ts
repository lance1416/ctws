import { describe, expect, it } from 'vitest'
import { mentionAddress, mentionsIn } from './mentions'

const mira = '0199f1a2-0000-7000-8000-000000000001'
const amazon = '0199f1a2-0000-7000-8000-000000000002'

describe('mentionsIn', () => {
  it('finds a mention and keeps the sentence it is in', () => {
    const text = `Ask around first. [@Mira Chen](ctws://person/${mira}) said she can look at the CV. Then apply.`
    expect(mentionsIn(text)).toEqual([
      {
        type: 'person',
        id: mira,
        excerpt: `[@Mira Chen](ctws://person/${mira}) said she can look at the CV.`,
      },
    ])
  })

  it('splits sentences on Chinese full stops and line breaks too', () => {
    const text = `[@Mira Chen](ctws://person/${mira}) 说可以帮忙看简历。下周再问。\n[@Amazon](ctws://task/${amazon}) 的截止是周五`
    expect(mentionsIn(text).map((m) => [m.type, m.excerpt])).toEqual([
      ['person', `[@Mira Chen](ctws://person/${mira}) 说可以帮忙看简历。`],
      ['task', `[@Amazon](ctws://task/${amazon}) 的截止是周五`],
    ])
  })

  it('counts one thing mentioned twice in one sentence once, and in two sentences twice', () => {
    const once = `[@A](ctws://person/${mira}) and [@A again](ctws://person/${mira}) met.`
    expect(mentionsIn(once)).toHaveLength(1)
    const twice = `[@A](ctws://person/${mira}) came. [@A](ctws://person/${mira}) left.`
    expect(mentionsIn(twice)).toHaveLength(2)
  })

  it('ignores links that are not mentions, and addresses of kinds it does not know', () => {
    const text = `See [the doc](https://example.com) and [@x](ctws://gossip/${mira}) and [plain](ctws://person/${mira}).`
    expect(mentionsIn(text)).toEqual([])
  })

  it('reads an id in upper case as the same thing', () => {
    expect(mentionsIn(`[@A](ctws://person/${mira.toUpperCase()}).`)[0]?.id).toBe(mira)
  })

  it('has nothing to say about empty text', () => {
    expect(mentionsIn(null)).toEqual([])
    expect(mentionsIn('')).toEqual([])
  })

  it('writes the address the editor inserts', () => {
    expect(mentionAddress('person', mira)).toBe(`ctws://person/${mira}`)
  })
})
