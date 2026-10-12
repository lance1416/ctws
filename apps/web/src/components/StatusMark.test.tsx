import type { TaskStatus } from '@ctws/contracts'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { StatusMark } from './StatusMark'

/**
 * THE STATUS MARK, by shape: a ring not started, a half-filled ring in progress, a disc with a
 * check done.
 *
 * Every part is always in the markup -- a status change is a 120ms transition on an element that
 * is already there, not a mount -- so what this reads is which parts are SHOWN.
 */
const shown = (status: TaskStatus) => {
  const html = renderToStaticMarkup(<StatusMark status={status} />)
  const part = (name: string) => {
    const tag = new RegExp(`<[^>]*data-part="${name}"[^>]*>`).exec(html)?.[0]
    expect(tag, `${name} is always drawn`).toBeDefined()
    return !/\b(opacity-0|scale-0)\b/.test(tag!)
  }
  return { half: part('half'), disc: part('disc'), check: part('check'), html }
}

describe('the status mark', () => {
  it('draws in progress as the right half filled, with no check', () => {
    const s = shown('in_progress')
    expect([s.half, s.disc, s.check]).toEqual([true, false, false])
    // The right half exactly: from the top of the ring, round the right side to the bottom.
    expect(s.html).toContain('d="M10 2.2a7.8 7.8 0 0 1 0 15.6z"')
  })

  it('draws done as the whole disc and the check, and no half', () => {
    const s = shown('done')
    expect([s.half, s.disc, s.check]).toEqual([false, true, true])
  })

  it('draws to do as the ring alone', () => {
    const s = shown('todo')
    expect([s.half, s.disc, s.check]).toEqual([false, false, false])
  })

  it('animates every part, so a change of status is never a jump', () => {
    for (const part of ['half', 'disc', 'check']) {
      const tag = new RegExp(`<[^>]*data-part="${part}"[^>]*>`).exec(
        renderToStaticMarkup(<StatusMark status="todo" />),
      )![0]
      expect(tag, part).toMatch(/duration-120/)
    }
  })
})
