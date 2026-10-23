import { describe, expect, it } from 'vitest'
import { mentionsAsLinks, mentionsAsWords } from './mention'

const MIRA = 'ctws://person/0199f0d6-0000-7000-8000-000000000001'
const MIRA_CO = 'ctws://organisation/0199f0d6-0000-7000-8000-000000000002'

describe('mentions while notes are typed', () => {
  it('shows a mention as its words, and gives it back its link when saved', () => {
    const stored = `Ask [@Mira Chen](${MIRA}) which questions came up.`
    const { text, links } = mentionsAsWords(stored)
    expect(text).toBe('Ask @Mira Chen which questions came up.')
    expect(mentionsAsLinks(text, links)).toBe(stored)
  })

  it('keeps what was typed around it, and a mention written twice is linked twice', () => {
    const { text, links } = mentionsAsWords(`[@Mira Chen](${MIRA}) and again`)
    expect(mentionsAsLinks(`Before. ${text}, @Mira Chen.`, links)).toBe(
      `Before. [@Mira Chen](${MIRA}) and again, [@Mira Chen](${MIRA}).`,
    )
  })

  it('links the longer words first, so a shorter mention inside them is left alone', () => {
    const { text, links } = mentionsAsWords(`[@Mira](${MIRA_CO}) [@Mira Chen](${MIRA})`)
    expect(text).toBe('@Mira @Mira Chen')
    expect(mentionsAsLinks(text, links)).toBe(`[@Mira](${MIRA_CO}) [@Mira Chen](${MIRA})`)
  })

  it('leaves other links and plain text as they are', () => {
    const plain = 'See [the doc](https://example.com) and @nobody.'
    const { text, links } = mentionsAsWords(plain)
    expect(text).toBe(plain)
    expect(mentionsAsLinks(text, links)).toBe(plain)
  })
})
