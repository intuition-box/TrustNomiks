import { cache } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Lightpaper } from '@/features/lightpaper/lightpaper'
import type { FactorySharedDesign } from '@/types/factory'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Resolve a share slug into the curated design payload. Anonymous access:
 * the server client without a session runs as anon, and the RPC is the
 * only anon-reachable surface (SECURITY DEFINER, curated columns). A dead,
 * revoked or malformed slug resolves to null and the page 404s. cache()
 * dedupes between generateMetadata and the page render.
 */
const loadSharedDesign = cache(
  async (slug: string): Promise<FactorySharedDesign | null> => {
    if (!UUID_RE.test(slug)) return null
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('get_shared_factory_design', {
      p_slug: slug,
    })
    if (error) {
      console.error('Shared design fetch failed:', error.message)
      return null
    }
    return (data as FactorySharedDesign | null) ?? null
  },
)

interface SharePageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({
  params,
}: SharePageProps): Promise<Metadata> {
  const { slug } = await params
  const design = await loadSharedDesign(slug)
  if (!design) return { title: 'Design not found · TrustNomiks' }
  return {
    title: `${design.project.name} (${design.project.ticker}) · Tokenomics lightpaper`,
    description: `Token design for ${design.project.name}: supply, allocation, vesting and stress-tested projections. Designed with TrustNomiks Factory.`,
    // Private-by-link: reachable only through an unguessable slug, so ask
    // crawlers that stumble on one not to index it.
    robots: { index: false },
  }
}

export default async function SharedDesignPage({ params }: SharePageProps) {
  const { slug } = await params
  const design = await loadSharedDesign(slug)
  if (!design) notFound()
  return <Lightpaper design={design} />
}
