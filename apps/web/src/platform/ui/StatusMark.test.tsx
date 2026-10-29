import type { TaskStatus } from '@ctws/contracts'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { StatusMark } from './StatusMark'

// Every part is always in the markup, so a status change is a transition, not a mount; this reads
// which parts are shown.
const shown = (status: TaskStatus) => {
  const html = renderToStaticMarkup(<StatusMark status={status} />)
  const part = (name: string) => {
    const tag = new RegExp(`<[^>]*data-part="${name}"[^>]*>`).exec(html)?.[0]
    expect(tag, `${name} is always drawn`).toBeDefined()
    return !/\b(opacity-0|scale-0)\b/.test(tag!)
  }
  return { half: part('half'), check: part('check'), html }
}

describe('the status mark', () => {
  it('draws in progress as the right half filled, with no check', () => {
    const s = shown('in_progress')
    expect([s.half, s.check]).toEqual([true, false])
    // The right half exactly: from the top of the ring, round the right side to the bottom.
    expect(s.html).toContain('d="M10 2.2a7.8 7.8 0 0 1 0 15.6z"')
  })

  it('draws done as the ring and the check, and no half (U-24)', () => {
    const s = shown('done')
    expect([s.half, s.check]).toEqual([false, true])
  })

  it('draws to do as the ring alone', () => {
    const s = shown('todo')
    expect([s.half, s.check]).toEqual([false, false])
  })

  it('animates every part, so a change of status is never a jump', () => {
    for (const part of ['half', 'check']) {
      const tag = new RegExp(`<[^>]*data-part="${part}"[^>]*>`).exec(
        renderToStaticMarkup(<StatusMark status="todo" />),
      )![0]
      expect(tag, part).toMatch(/duration-120/)
    }
  })
})
