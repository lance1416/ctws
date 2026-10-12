import { expect, test, type Page } from '@playwright/test'
import { registerFreshUser, WEB } from './helpers'

/**
 * ENTER WHILE AN IME IS COMPOSING IS NOT A SUBMIT.
 *
 * Typing English inside a Chinese IME and pressing Enter is how a lot of people type English: the
 * Enter commits the letters out of the candidate buffer. It must not also file the task, save the
 * person or close the editor -- and it did, on every input in this app.
 *
 * The composition is driven here the way SAFARI dispatches it -- `compositionend` BEFORE the
 * `keydown` that caused it -- because that ordering is what defeats `KeyboardEvent.isComposing`
 * on its own, and it is the ordering on the machine this is used from. Chrome's order is the
 * other way round and was already handled.
 */

/**
 * Types `text` into the focused element as an IME would, then presses Enter to commit it,
 * dispatching the events in Safari's order.
 */
async function commitWithIme(page: Page, selector: string, text: string) {
  await page.locator(selector).focus()
  await page.evaluate(
    ([sel, value]) => {
      const el = document.querySelector(sel as string) as HTMLInputElement | HTMLTextAreaElement
      const set = (v: string) => {
        const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement
        Object.getOwnPropertyDescriptor(proto.prototype, 'value')!.set!.call(el, v)
        el.dispatchEvent(new Event('input', { bubbles: true }))
      }
      el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
      set(value as string)
      // Safari's order: the composition ends, and only THEN does the Enter arrive.
      el.dispatchEvent(
        new CompositionEvent('compositionend', { bubbles: true, data: value as string }),
      )
      el.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      )
    },
    [selector, text],
  )
}

test('committing English out of an IME does not file the capture', async ({ page }) => {
  await registerFreshUser(page)
  await commitWithIme(page, 'input[aria-label="Capture"]', 'hello')

  // The letters are still in the box and nothing was filed.
  await expect(page.getByLabel('Capture')).toHaveValue('hello')
  await expect(page.getByText('Added to')).toHaveCount(0)
})

test('committing English out of an IME does not create a task', async ({ page }) => {
  await registerFreshUser(page)
  const made = await page.request.post('/api/v1/projects', {
    headers: WEB,
    data: { name: '改版' },
  })
  const { id } = (await made.json()) as { id: string }
  await page.goto(`/projects/${id}`)

  await commitWithIme(page, 'input[aria-label="New task"]', 'ship it')
  await expect(page.getByLabel('New task')).toHaveValue('ship it')
  await expect(page.getByRole('button', { name: 'Task: ship it', exact: true })).toHaveCount(0)
})

test('committing English out of an IME does not submit the form', async ({ page }) => {
  await registerFreshUser(page, '/people')
  await page.request.post('/api/v1/people', {
    headers: WEB,
    data: { name: '陈颖' },
  })
  await page.reload()
  await page.getByRole('button', { name: '陈颖' }).click()
  const pane = page.getByRole('dialog', { name: 'People' })
  await pane.getByRole('button', { name: 'Edit', exact: true }).click()

  // 表里的输入框由 <label for> 命名，不是 aria-label：这里按 id 取，别去给它加第二个名字。
  await commitWithIme(page, 'input#c-org', 'Acme')
  // 表还开着，刚打的字还在：那个 Enter 是 IME 的，不是提交。
  await expect(pane.getByRole('textbox', { name: 'Company' })).toHaveValue('Acme')
  await expect(pane.getByRole('button', { name: 'Save' })).toBeVisible()
})

test('a real Enter still submits', async ({ page }) => {
  // The guard must not swallow the Enter anybody actually meant.
  await registerFreshUser(page)
  await page.getByLabel('Capture').fill('写迁移')
  await page.getByLabel('Capture').press('Enter')
  await expect(page.getByText('Added to')).toBeVisible()
  await expect(page.getByLabel('Capture')).toHaveValue('')
})
