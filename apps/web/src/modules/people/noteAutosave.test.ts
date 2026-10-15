import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNoteAutosave } from './noteAutosave'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('saving a note while it is written', () => {
  it('saves once a second after typing stops, with the last text', async () => {
    const save = vi.fn(async () => {})
    const notes = createNoteAutosave(save)
    notes.change('a')
    notes.change('ab')
    notes.change('abc')
    expect(save).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenLastCalledWith('abc')
  })

  it('never has two saves in flight, and sends the newest text after the first lands', async () => {
    let land!: () => void
    const save = vi.fn(() => new Promise<void>((r) => (land = r)))
    const notes = createNoteAutosave(save)
    notes.change('one')
    await vi.advanceTimersByTimeAsync(1000)
    notes.change('one two')
    await vi.advanceTimersByTimeAsync(1000)
    expect(save).toHaveBeenCalledTimes(1)
    land()
    await vi.advanceTimersByTimeAsync(0)
    expect(save).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenLastCalledWith('one two')
  })

  it('saves at once on flush, without waiting for the pause', async () => {
    const save = vi.fn(async () => {})
    const notes = createNoteAutosave(save)
    notes.change('closing now')
    await notes.flush()
    expect(save).toHaveBeenCalledWith('closing now')
  })

  it('does not save text that was already saved', async () => {
    const save = vi.fn(async () => {})
    const notes = createNoteAutosave(save)
    notes.change('same')
    await vi.advanceTimersByTimeAsync(1000)
    await notes.flush()
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('keeps text whose save failed, says so, and tries it again on the next flush', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined)
    const failed = vi.fn()
    const notes = createNoteAutosave(save, failed)
    notes.change('do not lose me')
    await vi.advanceTimersByTimeAsync(1000)
    expect(failed).toHaveBeenLastCalledWith(true)
    await notes.flush()
    expect(save).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenLastCalledWith('do not lose me')
    expect(failed).toHaveBeenLastCalledWith(false)
  })
})
