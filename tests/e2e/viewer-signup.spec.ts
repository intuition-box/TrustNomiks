import { test, expect } from '@playwright/test'

/**
 * Generates a fresh-looking test email per test invocation. Uses a
 * module-level counter plus the worker index (not Date.now()/Math.random) so
 * emails stay unique across a run without relying on wall-clock entropy.
 */
let signupCounter = 0

function freshSignupEmail(workerIndex: number): string {
  signupCounter += 1
  return `trustnomiks-e2e-signup-w${workerIndex}-${signupCounter}@example.com`
}

test('signup with a fresh email shows the confirmation-pending panel, not the dashboard', async ({
  page,
}, testInfo) => {
  const email = freshSignupEmail(testInfo.workerIndex)

  await page.goto('/login')
  await page.getByRole('tab', { name: 'Create account' }).click()

  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill('Tru$tN0miks-e2e')
  await page
    .getByLabel('Confirm password', { exact: true })
    .fill('Tru$tN0miks-e2e')

  await page.getByRole('button', { name: 'Create account' }).click()

  // Email confirmation is required before a session exists (see
  // handleSignup in src/app/login/page.tsx), so a fresh signup lands on the
  // "Check your inbox" panel with a resend control, rather than /dashboard.
  await expect(
    page.getByRole('heading', { name: 'Check your inbox' }),
  ).toBeVisible()
  await expect(page.getByText(email)).toBeVisible()
  await expect(
    page.getByRole('button', { name: /resend email/i }),
  ).toBeVisible()

  await expect(page).not.toHaveURL(/\/dashboard$/)
})
