import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AuthenticatedShell } from '@/components/authenticated-shell'
import type { Role } from '@/components/role-context'

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    redirect('/login')
  }

  // Derived role: a contributor has proven ownership of >= 1 active wallet
  // (see wallet_links / useWalletLink); everyone else is a viewer. Additive
  // only here, CTA gating on this role lands in Phase 5.
  const { count } = await supabase
    .from('wallet_links')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .is('unlinked_at', null)

  const role: Role = count && count > 0 ? 'contributor' : 'viewer'

  return (
    <AuthenticatedShell user={user} role={role}>
      {children}
    </AuthenticatedShell>
  )
}
