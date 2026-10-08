import { test } from '@playwright/test'
import { registerFreshUser } from './helpers'

const H = { 'x-ctws-client': 'web' }

test('shot', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await registerFreshUser(page)
  const p = await (
    await page.request.post('/api/v1/projects', { headers: H, data: { name: '找工作' } })
  ).json()
  await page.request.post('/api/v1/contacts', {
    headers: H,
    data: {
      name: '陈颖',
      org: 'Acme 招聘',
      projectId: p.id,
      channels: [
        { kind: 'email', value: 'ying.chen@acme.test', label: '工作' },
        { kind: 'phone', value: '+86 138 0000 0000' },
      ],
    },
  })
  await page.request.post('/api/v1/contacts', {
    headers: H,
    data: {
      name: 'Dana Whitfield',
      org: 'rrgen maintainer',
      channels: [{ kind: 'url', value: 'https://github.com/dana' }],
    },
  })
  await page.request.post('/api/v1/contacts', {
    headers: H,
    data: { name: '老王', note: '以前同事' },
  })
  await page.goto('/contacts')
  await page.getByText('陈颖').waitFor()
  await page.waitForTimeout(300)
  await page.screenshot({ path: '../../scratchpad/shots/contacts.png' })

  await page.getByRole('button', { name: '陈颖' }).click()
  await page.getByRole('dialog', { name: '编辑联系人' }).waitFor()
  await page.waitForTimeout(300)
  await page.screenshot({ path: '../../scratchpad/shots/contact-dialog.png' })
})
