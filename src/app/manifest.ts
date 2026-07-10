import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'TrustNomiks',
    short_name: 'TrustNomiks',
    description:
      'Turn fragmented tokenomics into verifiable, on-chain claims. A living knowledge graph of Atoms & Triples, curated by $TRUST.',
    start_url: '/',
    display: 'standalone',
    // hsl(240 10% 4%) — the dark "void" background token
    background_color: '#09090b',
    theme_color: '#09090b',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  }
}
