import { describe, expect, it, vi } from 'vitest'
import { inlineEditProps } from './useInlineEdit'

const composing = (now: boolean) => ({
  bind: { onCompositionStart: () => {}, onCompositionEnd: () => {} },
  composingNow: () => now,
})

const key = (name: string) => {
  const e = { key: name, defaultPrevented: false, preventDefault: () => {}, nativeEvent: {} }
  e.preventDefault = () => {
    e.defaultPrevented = true
  }
  return e
}

describe('the keys of a one-line field', () => {
  it('commits on Enter', () => {
    const onCommit = vi.fn()
    inlineEditProps(composing(false), { onCommit }).onKeyDown(key('Enter') as never)
    expect(onCommit).toHaveBeenCalledTimes(1)
  })

  it('does not commit on the Enter that belongs to an IME', () => {
    const onCommit = vi.fn()
    inlineEditProps(composing(true), { onCommit }).onKeyDown(key('Enter') as never)
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('cancels on Escape and marks the press spent, so what holds the field stays open', () => {
    const onCancel = vi.fn()
    const e = key('Escape')
    inlineEditProps(composing(false), { onCommit: () => {}, onCancel }).onKeyDown(e as never)
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(e.defaultPrevented).toBe(true)
  })

  it('leaves Escape alone when the field has nothing to cancel', () => {
    const e = key('Escape')
    inlineEditProps(composing(false), { onCommit: () => {} }).onKeyDown(e as never)
    expect(e.defaultPrevented).toBe(false)
  })
})
