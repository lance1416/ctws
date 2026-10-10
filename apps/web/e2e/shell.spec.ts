import { expect, test } from '@playwright/test'
import { registerFreshUser } from './helpers'

test('the app shell routes between today, projects and a project', async ({ page }) => {
  await registerFreshUser(page)
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible()

  // The id the API assigned to the inbox: the URL must carry exactly this, not merely
  // something shaped like a UUID.
  const res = await page.request.get('/api/v1/projects')
  const { projects } = (await res.json()) as { projects: { id: string; name: string }[] }
  const inbox = projects.find((p) => p.name === 'Inbox')
  expect(inbox).toBeDefined()

  await page.getByRole('link', { name: 'Projects' }).click()
  await expect(page).toHaveURL(/\/projects$/)
  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible()
  // Registration creates the inbox, so the project list is never empty. Scoped to <main>: the
  // left rail lists the same projects, so two links carry this name now.
  await page.getByRole('main').getByRole('link', { name: 'Inbox' }).click()

  await expect(page).toHaveURL(`/projects/${inbox!.id}`)
  await expect(page.getByRole('heading', { name: 'Inbox' })).toBeVisible()
})

test('an unauthenticated visit lands on login', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByLabel('Email')).toBeVisible()
})

// Tailwind 4 hoists an @theme nested in @media out of the query, so a build can end up with only
// the dark token values (light mode rendered dark). The two schemes must resolve differently.
test('light and dark colour schemes produce different page backgrounds', async ({ page }) => {
  await page.goto('/login')
  const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor)

  await page.emulateMedia({ colorScheme: 'light' })
  const light = await background()
  await page.emulateMedia({ colorScheme: 'dark' })
  const dark = await background()

  expect(light).not.toBe(dark)
})

// A failed fetch must say so rather than render an empty list that reads as "no projects".
// Assert the exact text: a garbled string would still satisfy a bare "an alert exists".
test('a failed project list shows an error, not an empty list', async ({ page }) => {
  await registerFreshUser(page)
  await page.route('**/api/v1/projects', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{"title":"boom"}' }),
  )

  await page.getByRole('link', { name: 'Projects' }).click()

  const alert = page.getByRole('alert')
  await expect(alert).toBeVisible()
  await expect(alert).toContainText("Couldn't load projects")
})

/**
 * A SERVER THAT IS DOWN IS NOT A SIGNED-OUT VISITOR.
 *
 * Only a 401 answers "nobody is signed in". Swallowing every failure into that sends the reader
 * to a login page that cannot reach the server either, which reads as a password that stopped
 * working; everything that is not a 401 is the shell's to say.
 */
test('a server that cannot be reached says so instead of showing the login page', async ({
  page,
}) => {
  await registerFreshUser(page)
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{"title":"boom"}' }),
  )
  await page.goto('/tasks/today')

  await expect(page.getByRole('alert')).toContainText("Can't reach the server")
  // NOT the login page: the session is still good, and saying otherwise is the defect.
  expect(new URL(page.url()).pathname).not.toBe('/login')
  await expect(page.getByRole('button', { name: 'Create an account' })).toHaveCount(0)
})
