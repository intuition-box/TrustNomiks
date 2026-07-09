import { test, expect } from '@playwright/test'

// Documents the "upgrade to contributor" gating fallback: WalletGate
// (src/components/composite/wallet-gate.tsx) renders "On-chain features are
// disabled in this environment." whenever `walletEnabled` is false, i.e.
// NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is unset - the expected state in CI,
// where no wallet secret is configured. RoleGate
// (src/components/composite/role-gate.tsx) delegates to WalletGate for that
// same fallback, so both stay in lockstep.
//
// Both gates only render inside an (authenticated) route (/tokens/new,
// /export), which the proxy (src/proxy.ts, deny-by-default) redirects to
// /login for every signed-out visitor. Seeding a real session is not
// feasible here, so this spec asserts what is reachable unauthenticated and
// leaves the fallback-content assertion as a skipped TODO.

test('unauthenticated visit to /export redirects to /login (WalletGate is unreachable signed out)', async ({
  page,
}) => {
  await page.goto('/export')
  await expect(page).toHaveURL(/\/login$/)
})

// TODO(seeded session, NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID unset): once a
// session can be seeded, replace this with:
//   await page.goto('/tokens/new')
//   await expect(
//     page.getByText('On-chain features are disabled in this environment.'),
//   ).toBeVisible()
// This is reliable in CI specifically because CI has no WalletConnect
// project id configured, so `walletEnabled` is false there regardless of
// local `.env.local` contents.
test.skip('RoleGate/WalletGate show the disabled-in-this-environment fallback when no WalletConnect id is configured', async () => {
  // Requires a seeded session; see TODO above.
})
