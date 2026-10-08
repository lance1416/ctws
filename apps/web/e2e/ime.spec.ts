import { expect, test, type Page } from '@playwright/test'
import { registerFreshUser } from './helpers'

/**
 * ENTER WHILE AN IME IS COMPOSING IS NOT A SUBMIT.
 *
 * Typing English inside a Chinese IME and pressing Enter is how a lot of people type English: the
 * Enter commits the letters out of the candidate buffer. It must not also file the task, save the
 * contact or close the editor -- and it did, on every input in this app.
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
  await commitWithIme(page, 'input[aria-label="捕获"]', 'hello')

  // The letters are still in the box and nothing was filed.
  await expect(page.getByLabel('捕获')).toHaveValue('hello')
  await expect(page.getByText('已放入')).toHaveCount(0)
})

test('committing English out of an IME does not create a task', async ({ page }) => {
  await registerFreshUser(page)
  const made = await page.request.post('/api/v1/projects', {
    headers: { 'x-ctws-client': 'web' },
    data: { name: '改版' },
  })
  const { id } = (await made.json()) as { id: string }
  await page.goto(`/projects/${id}`)

  await commitWithIme(page, 'input[aria-label="新任务"]', 'ship it')
  await expect(page.getByLabel('新任务')).toHaveValue('ship it')
  await expect(page.getByRole('button', { name: '任务：ship it', exact: true })).toHaveCount(0)
})

test('committing English out of an IME does not close an inline editor', async ({ page }) => {
  await registerFreshUser(page, '/contacts')
  await page.request.post('/api/v1/contacts', {
    headers: { 'x-ctws-client': 'web' },
    data: { name: '陈颖' },
  })
  await page.reload()
  await page.getByRole('button', { name: '陈颖' }).click()
  const pane = page.getByRole('dialog', { name: '联系人' })
  await pane.getByRole('button', { name: '改公司' }).click()

  await commitWithIme(page, 'input[aria-label="公司"]', 'Acme')
  // Still open, still holding what was typed: the Enter belonged to the IME.
  await expect(pane.getByRole('textbox', { name: '公司' })).toHaveValue('Acme')
})

test('a real Enter still submits', async ({ page }) => {
  // The guard must not swallow the Enter anybody actually meant.
  await registerFreshUser(page)
  await page.getByLabel('捕获').fill('写迁移')
  await page.getByLabel('捕获').press('Enter')
  await expect(page.getByText('已放入')).toBeVisible()
  await expect(page.getByLabel('捕获')).toHaveValue('')
})
