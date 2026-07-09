import { test, expect } from '@playwright/test'

test('landing page renders and shows the TrustNomiks brand', async ({
  page,
}) => {
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: /the tokenomics/i }),
  ).toBeVisible()
  await expect(page.getByText('TrustNomiks', { exact: true })).toBeVisible()
})

test('login page renders with email and password inputs', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible()
})

test('unauthenticated visit to /dashboard redirects to /login', async ({
  page,
}) => {
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login$/)
})
