import { createTaskBody, updateTaskBody } from '@ctws/contracts'
import { zodResolver } from '@hookform/resolvers/zod'
import { describe, expect, it } from 'vitest'
import { createTaskForm, detailTaskForm, PATCH_KEYS, titleProblem } from './taskForm'

/**
 * What these pin is the REASON `react-hook-form` + `@hookform/resolvers` is the right pairing here
 * rather than some other form library: the rule the form enforces is the CONTRACT's rule, reached
 * through the same resolver the components use, not a second copy written beside it.
 *
 * So the assertions are made through `zodResolver` -- the exact object the two forms pass to
 * `useForm` -- and about the contract's own constraints. Narrow `title` in
 * `packages/contracts/src/task.ts` and the "accepts" cases below go red; that is the whole claim.
 */
const CONTEXT = { fields: {}, shouldUseNativeValidation: false }
const resolveCreate = (values: unknown) =>
  zodResolver(createTaskForm)(values as never, undefined, CONTEXT as never)
const resolveDetail = (values: unknown) =>
  zodResolver(detailTaskForm)(values as never, undefined, CONTEXT as never)

const PROJECT = '018f7b2c-0000-7000-8000-000000000001'
const draft = (over: Record<string, unknown> = {}) => ({
  projectId: PROJECT,
  parentId: null,
  title: '写方案',
  status: 'backlog',
  scheduledOn: null,
  dueAt: null,
  notes: null,
  ...over,
})

describe('the create form validates with the create CONTRACT', () => {
  it('is the contract object itself, so the two cannot drift', () => {
    expect(createTaskForm).toBe(createTaskBody)
  })

  it('makes the detail form the update contract plus the project, which no PATCH carries', () => {
    expect(Object.keys(detailTaskForm.shape).sort()).toEqual(
      [...Object.keys(updateTaskBody.shape), 'projectId'].sort(),
    )
    expect(PATCH_KEYS).not.toContain('projectId')
  })

  it('accepts a draft the contract accepts, and hands back the schema’s parsed values', async () => {
    // Untrimmed in, trimmed out: the component sends what the RESOLVER produced, so this is also
    // the proof that nothing has to trim the title a second time.
    const out = await resolveCreate(draft({ title: '  写方案  ' }))
    expect(out.errors).toEqual({})
    expect(out.values).toEqual(draft({ title: '写方案' }))
  })

  it('refuses an empty title, and a whitespace-only one, with the contract’s own code', async () => {
    for (const title of ['', '   ', '　']) {
      const out = await resolveCreate(draft({ title }))
      expect(out.values, `"${title}" must not become a request body`).toEqual({})
      // `too_small` is the code the contract's `.trim().min(1)` produces. The app's sentence is
      // keyed on it rather than hard-wired beside it.
      expect(out.errors.title?.type).toBe('too_small')
      expect(titleProblem(out.errors.title?.type as string)).toBe('Title is required')
    }
  })

  it('refuses a title past the contract’s own maximum, and says a different thing', async () => {
    const out = await resolveCreate(draft({ title: 'あ'.repeat(501) }))
    expect(out.errors.title?.type).toBe('too_big')
    expect(titleProblem(out.errors.title?.type as string)).toBe('Title is too long')
    // The two refusals are not one sentence with two causes.
    expect(titleProblem('too_big')).not.toBe(titleProblem('too_small'))
    expect(titleProblem(undefined)).toBeNull()
  })

  it('refuses the empty string where the contract wants a day or null', async () => {
    // This is the defect the hand-written forms avoided by remembering to map '' to null at every
    // call site. The resolver now refuses it at the boundary instead, so a forgotten mapping is a
    // form that will not submit rather than a 400 from the server.
    expect((await resolveCreate(draft({ scheduledOn: '' }))).errors.scheduledOn).toBeTruthy()
    expect((await resolveCreate(draft({ dueAt: '' }))).errors.dueAt).toBeTruthy()
    expect(
      (await resolveCreate(draft({ scheduledOn: '2026-02-30' }))).errors.scheduledOn,
    ).toBeTruthy()
    // A bare wall-clock string is not an instant: the contract demands an offset.
    expect((await resolveCreate(draft({ dueAt: '2026-10-03T23:59:00' }))).errors.dueAt).toBeTruthy()
    expect((await resolveCreate(draft({ dueAt: '2026-10-03T23:59:00.000Z' }))).errors).toEqual({})
  })

  it('refuses a field the contract does not have, because the contract is strict', async () => {
    const out = await resolveCreate({ ...draft(), rank: 'a0' })
    expect(out.values).toEqual({})
    expect(Object.keys(out.errors).length).toBeGreaterThan(0)
  })
})

describe('the detail form validates with the UPDATE contract', () => {
  it('accepts a PATCH naming only some fields, because the contract is partial', async () => {
    const out = await resolveDetail({ projectId: PROJECT, title: '写方案 v2' })
    expect(out.errors).toEqual({})
    expect(out.values).toEqual({ projectId: PROJECT, title: '写方案 v2' })
  })

  it('still refuses an empty title when the title IS named', async () => {
    const out = await resolveDetail({ projectId: PROJECT, title: '  ', notes: null })
    expect(out.errors.title?.type).toBe('too_small')
    expect(out.values).toEqual({})
  })

  it('takes null for the two dates and the notes, which is how a PATCH clears them', async () => {
    const out = await resolveDetail({
      projectId: PROJECT,
      scheduledOn: null,
      dueAt: null,
      notes: null,
    })
    expect(out.errors).toEqual({})
    expect(out.values).toEqual({ projectId: PROJECT, scheduledOn: null, dueAt: null, notes: null })
  })

  it('refuses a project that is not an id', async () => {
    const out = await resolveDetail({ projectId: 'inbox', title: '写方案' })
    expect(out.errors.projectId).toBeTruthy()
  })
})
