import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SidebarNav } from '@/components/sidebar-nav'
import { MobileNav } from '@/components/mobile-nav'

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

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar - hidden on mobile, fixed on desktop */}
      <aside className="fixed left-0 top-0 z-30 hidden h-screen w-64 border-r border-border bg-card md:block">
        <SidebarNav user={user} />
      </aside>

      {/* Mobile top bar */}
      <div className="fixed left-0 right-0 top-0 z-30 flex h-14 items-center border-b border-border bg-card px-4 md:hidden">
        <MobileNav user={user} />
        <h1 className="ml-3 text-lg font-bold text-primary">TrustNomiks</h1>
      </div>

      {/* Main content - offset by sidebar on desktop, top bar on mobile */}
      <main className="mt-14 flex-1 p-4 md:ml-64 md:mt-0 md:p-8">
        {children}
      </main>
    </div>
  )
}
