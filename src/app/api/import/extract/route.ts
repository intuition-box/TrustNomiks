import { NextResponse } from 'next/server'

import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'

import { normalizeExtraction } from '@/lib/import/normalize'
import { EXTRACTION_SYSTEM_PROMPT } from '@/lib/import/prompt'
import { checkImportRateLimit } from '@/lib/import/rate-limit'
import {
  extractRequestSchema,
  extractionResultSchema,
} from '@/lib/import/schemas'
import { createClient } from '@/lib/supabase/server'

// A vision extraction over a dense image can run past the default serverless
// ceiling; give it room.
export const maxDuration = 60

// Transcription from an image is a vision/OCR task, not a reasoning one, so
// the lite tier without thinking is the right default; override per deploy.
const EXTRACT_MODEL = process.env.IMPORT_EXTRACT_MODEL ?? 'claude-haiku-4-5'

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: isContributor, error: roleErr } =
    await supabase.rpc('is_contributor')
  if (roleErr) {
    return NextResponse.json({ error: roleErr.message }, { status: 500 })
  }
  if (!isContributor) {
    return NextResponse.json(
      { error: 'Contributor role required' },
      { status: 403 },
    )
  }

  const { allowed, retryAfterSeconds } = checkImportRateLimit(user.id)
  if (!allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
    )
  }

  const parsed = extractRequestSchema.safeParse(
    await request.json().catch(() => ({})),
  )
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid import request' },
      { status: 400 },
    )
  }
  const body = parsed.data

  const content: Anthropic.ContentBlockParam[] = []
  if (body.image) {
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: body.image.media_type,
        data: body.image.data,
      },
    })
  }
  const existingBlock =
    body.existing_segments && body.existing_segments.length > 0
      ? `\n\nEXISTING allocation labels already in the analyst's form (for matched_label; use these exact strings or null):\n${body.existing_segments
          .map((s) => `- ${s.label}`)
          .join('\n')}`
      : ''
  content.push({
    type: 'text',
    text:
      (body.text?.trim()
        ? `Extract the tokenomics data from the following pasted content:\n\n${body.text}`
        : 'Extract the tokenomics data from the attached image.') +
      existingBlock,
  })

  const anthropic = new Anthropic()
  try {
    const response = await anthropic.messages.parse({
      model: EXTRACT_MODEL,
      max_tokens: 16000,
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
      output_config: {
        format: zodOutputFormat(extractionResultSchema),
      },
    })

    if (response.stop_reason === 'refusal' || !response.parsed_output) {
      return NextResponse.json(
        { error: 'The model could not extract data from this content' },
        { status: 422 },
      )
    }

    return NextResponse.json({
      suggestions: normalizeExtraction(
        response.parsed_output,
        body.existing_segments ?? [],
      ),
    })
  } catch (err) {
    // Credential resolution is the SDK's job (env key, auth token, or an
    // `ant auth login` profile); only its failure means "not configured".
    if (err instanceof Anthropic.AuthenticationError) {
      return NextResponse.json(
        {
          error:
            'Extraction is not configured on this deployment (no Anthropic credential)',
        },
        { status: 503 },
      )
    }
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { error: 'Extraction service is busy, retry in a minute' },
        { status: 429 },
      )
    }
    if (err instanceof Anthropic.APIError) {
      console.error('import/extract: Anthropic API error', {
        status: err.status,
        message: err.message,
      })
      return NextResponse.json(
        { error: 'Extraction service error' },
        { status: 502 },
      )
    }
    console.error('import/extract: unexpected error', err)
    return NextResponse.json({ error: 'Extraction failed' }, { status: 500 })
  }
}
