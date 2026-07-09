import { test, expect } from '@playwright/test'

// Documents the viewer-gated expectations for the token-authoring surface:
//   - /tokens/new is wrapped in RoleGate (src/app/(authenticated)/tokens/new/page.tsx)
//     and should show its gate card, not the token-form step fields, for a
//     signed-in viewer (no active wallet link).
//   - The dashboard's "Add token" button is gated behind `isContributor`
//     (src/app/(authenticated)/dashboard/page.tsx).
//
// Both routes live in the (authenticated) group, so the proxy
// (src/proxy.ts, deny-by-default) redirects every signed-out visitor to
// /login before any gated UI can render. Seeding a real viewer session is
// not feasible here, so this spec asserts what is reachable unauthenticated
// (the login redirect, mirroring tests/e2e/smoke.spec.ts) and leaves the
// actual gate/no-button assertions as skipped TODOs for once a seeded
// viewer fixture exists.

test('unauthenticated visit to /tokens/new redirects to /login', async ({
  page,
}) => {
  await page.goto('/tokens/new')
  await expect(page).toHaveURL(/\/login$/)
})

test('unauthenticated visit to /dashboard redirects to /login', async ({
  page,
}) => {
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login$/)
})

// TODO(seeded viewer session): once a viewer (non-contributor) session can
// be seeded, replace this with:
//   await page.goto('/tokens/new')
//   await expect(page.getByText('Link a wallet to structure a token')).toBeVisible()
//   await expect(page.getByText(/structuring a token creates a draft/i)).toBeVisible()
//   // and assert none of the token-form step fields (Step1Identity, etc.)
//   // from src/components/token-form/steps are present.
test.skip('viewer sees the RoleGate card on /tokens/new, not the token-form fields', async () => {
  // Requires a seeded viewer session; see TODO above.
})

// TODO(seeded viewer session): once a viewer session can be seeded:
//   await page.goto('/dashboard')
//   await expect(page.getByRole('button', { name: /add token/i })).toHaveCount(0)
test.skip('viewer does not see an Add token button on the dashboard', async () => {
  // Requires a seeded viewer session; see TODO above.
})
