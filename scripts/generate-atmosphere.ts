/**
 * One-shot atmosphere-asset generation via fal.ai (FLUX dev).
 *
 *   npx tsx --env-file=.env.local scripts/generate-atmosphere.ts
 *
 * Experimental and non-blocking by decision (2026-07-10): textures only,
 * never figurative, never embedded text; the app always keeps a code-drawn
 * fallback and never depends on a generated asset at runtime. FAL_KEY is
 * read from .env.local at GENERATION time only; the resulting assets are
 * committed to public/ so the key plays no role in the running app.
 * Prompts + seeds live here so every asset is reproducible.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const FAL_KEY = process.env.FAL_KEY
if (!FAL_KEY) {
  console.error('FAL_KEY missing. Add it to .env.local and rerun.')
  process.exit(1)
}

interface AssetSpec {
  file: string
  seed: number
  prompt: string
}

// Art direction is locked by the Observatory language: dark void, luminous
// taxonomy hues, hairline structure. Texture, not illustration.
const ASSETS: AssetSpec[] = [
  {
    file: 'public/backdrops/login-atmosphere.jpg',
    seed: 20260710,
    prompt:
      'Abstract deep-space void background texture, near-black indigo canvas, ' +
      'faint nebula wisps in indigo and violet, sparse tiny luminous points ' +
      'like distant constellation nodes, a few hairline glowing connection ' +
      'lines, subtle emerald and amber accents, minimal, atmospheric, ' +
      'extremely dark, high resolution, no text, no letters, no objects, ' +
      'no figures, no planets, no lens flare',
  },
]

async function generate(spec: AssetSpec) {
  console.log(`Generating ${spec.file} (seed ${spec.seed})…`)
  const res = await fetch('https://fal.run/fal-ai/flux/dev', {
    method: 'POST',
    headers: {
      Authorization: `Key ${FAL_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: spec.prompt,
      image_size: 'landscape_16_9',
      num_inference_steps: 28,
      guidance_scale: 3.5,
      seed: spec.seed,
      num_images: 1,
      output_format: 'jpeg',
      enable_safety_checker: true,
    }),
  })
  if (!res.ok) {
    throw new Error(`fal.ai error ${res.status}: ${await res.text()}`)
  }
  const data = (await res.json()) as { images?: Array<{ url: string }> }
  const url = data.images?.[0]?.url
  if (!url) throw new Error('fal.ai returned no image')

  const img = await fetch(url)
  if (!img.ok) throw new Error(`asset download failed: ${img.status}`)
  const buf = Buffer.from(await img.arrayBuffer())

  const target = join(process.cwd(), spec.file)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, buf)
  console.log(`  saved ${spec.file} (${Math.round(buf.length / 1024)} KB)`)
}

async function main() {
  for (const spec of ASSETS) {
    await generate(spec)
  }
  console.log('Done. Review the assets, then commit public/backdrops/.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
