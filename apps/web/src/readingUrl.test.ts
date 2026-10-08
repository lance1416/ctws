import { describe, expect, it } from 'vitest'
import { isReadingUrl } from './readingUrl'

/**
 * THE CAPTURE ROUTING RULE. It decides where a typed line goes, so a wrong answer here sends work
 * to the wrong module -- and it is used in two places (capture and the 待读 input) that must
 * agree.
 */
describe('isReadingUrl', () => {
  it('claims a bare http(s) url', () => {
    expect(isReadingUrl('https://linear.app/now/redesign')).toBe(true)
    expect(isReadingUrl('http://example.com')).toBe(true)
    expect(isReadingUrl('  https://example.com/a?b=c#d  ')).toBe(true)
  })

  it('leaves a sentence that merely contains a url to the task module', () => {
    // 「看看这篇 https://… 」 is a note ABOUT a link, which is a task. A rule that claimed it
    // would quietly swallow sentences, and the only defence against a wrong guess is seeing
    // where the line went.
    expect(isReadingUrl('看看这篇 https://example.com')).toBe(false)
    expect(isReadingUrl('https://example.com 读完写个总结')).toBe(false)
  })

  it('refuses a scheme that is not http(s)', () => {
    for (const line of ['javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd']) {
      expect(isReadingUrl(line), line).toBe(false)
    }
  })

  it('refuses a scheme with no host, which links to nothing', () => {
    expect(isReadingUrl('https://')).toBe(false)
    expect(isReadingUrl('http://')).toBe(false)
  })

  it('refuses the empty line', () => {
    expect(isReadingUrl('')).toBe(false)
    expect(isReadingUrl('   ')).toBe(false)
  })
})
