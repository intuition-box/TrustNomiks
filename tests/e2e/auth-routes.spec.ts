import { test, expect } from '@playwright/test'

test('/auth/reset-password is reachable without auth (not redirected to /login by the proxy)', async ({
  page,
}) => {
  await page.goto('/auth/reset-password')
  await expect(page).toHaveURL(/\/auth\/reset-password$/)
})

test('/auth/reset-password with no recovery session shows the invalid-link state', async ({
  page,
}) => {
  await page.goto('/auth/reset-password')
  await expect(
    page.getByRole('heading', { name: 'Link expired' }),
  ).toBeVisible()
  await expect(
    page.getByText('This reset link is invalid or has expired.'),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'Back to login' })).toBeVisible()
})

test('/auth/confirm is reachable without auth (not redirected to /login by the proxy)', async ({
  page,
}) => {
  // With no `token_hash`/`type` or `code` query params, the route handler
  // itself redirects to `/login?authError=expired`
  // (src/app/auth/confirm/route.ts) - a deliberate app-level decision,
  // distinct from the proxy's deny-by-default redirect to a bare `/login`
  // (src/proxy.ts). The `authError` param is the signal that the proxy let
  // the request through to /auth/confirm at all.
  await page.goto('/auth/confirm')
  await expect(page).toHaveURL(/\/login\?authError=expired$/)
})
