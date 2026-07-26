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

const EXTRACT_MODEL = process.env.IMPORT_EXTRACT_MODEL ?? 'claude-opus-4-8'

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

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        error:
          'Extraction is not configured on this deployment (missing ANTHROPIC_API_KEY)',
      },
      { status: 503 },
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
  content.push({
    type: 'text',
    text: body.text?.trim()
      ? `Extract the tokenomics data from the following pasted content:\n\n${body.text}`
      : 'Extract the tokenomics data from the attached image.',
  })

  const anthropic = new Anthropic()
  try {
    const response = await anthropic.messages.parse({
      model: EXTRACT_MODEL,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
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
      suggestions: normalizeExtraction(response.parsed_output),
    })
  } catch (err) {
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
