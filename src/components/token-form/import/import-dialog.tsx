'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import {
  AlertTriangle,
  CheckCircle2,
  FileUp,
  HelpCircle,
  ImageIcon,
  Loader2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useTokenForm } from '@/components/token-form/token-form-context'
import { buildDefaultAttributions } from '@/components/token-form/completeness'
import type {
  ImportSuggestions,
  SuggestedSegment,
  SuggestedVesting,
} from '@/lib/import/schemas'

type PastedImage = {
  media_type: 'image/png' | 'image/jpeg' | 'image/webp'
  data: string
}

interface PendingImport {
  /** Vesting suggestions waiting for their allocation to get a DB id. */
  vestingByLabel: Map<string, SuggestedVesting>
  /** Labels whose allocation_segment claim the source documents. */
  segmentLabels: Set<string>
  /** Labels whose vesting_schedule claim the source documents. */
  vestingLabels: Set<string>
  /** Index of the appended source row, when a source URL was provided. */
  sourceIndex: number | null
}

/**
 * Normalize any pasted or picked image to PNG through a canvas. This kills a
 * whole class of clipboard quirks at once: Safari pasting TIFF from "Copy
 * Image", Finder file copies, and formats the API would reject. Very large
 * captures are downscaled (retina screenshots) to stay well under the
 * request-size cap without hurting table legibility.
 */
async function fileToPngBase64(file: File): Promise<PastedImage | null> {
  try {
    const bitmap = await createImageBitmap(file)
    const MAX_EDGE = 2400
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const dataUrl = canvas.toDataURL('image/png')
    return {
      media_type: 'image/png',
      data: dataUrl.slice(dataUrl.indexOf(',') + 1),
    }
  } catch {
    return null
  }
}

function guessSourceType(url: string): string {
  const lower = url.toLowerCase()
  if (lower.includes('whitepaper') || lower.endsWith('.pdf'))
    return 'whitepaper'
  if (
    lower.includes('docs.') ||
    lower.includes('/docs') ||
    lower.includes('wiki')
  )
    return 'docs'
  return 'other'
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function confidenceBadge(confidence: SuggestedSegment['confidence']) {
  if (confidence === 'high') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-success">
        <CheckCircle2 className="h-3 w-3" aria-hidden /> high
      </span>
    )
  }
  if (confidence === 'medium') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-warning">
        <HelpCircle className="h-3 w-3" aria-hidden /> medium
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-destructive">
      <AlertTriangle className="h-3 w-3" aria-hidden /> low
    </span>
  )
}

function vestingSummary(vesting: SuggestedVesting | null): string {
  if (!vesting) return 'No vesting suggested'
  const parts: string[] = []
  if (vesting.tge_percentage) parts.push(`${vesting.tge_percentage}% TGE`)
  if (vesting.cliff_months) parts.push(`${vesting.cliff_months}mo cliff`)
  if (vesting.cliff_unlock_percentage)
    parts.push(`${vesting.cliff_unlock_percentage}% at cliff`)
  if (vesting.duration_months)
    parts.push(
      `${vesting.duration_months}mo total, ${vesting.frequency || 'linear'}`,
    )
  return parts.length > 0 ? parts.join(' · ') : 'No vesting suggested'
}

export function ImportFromDocument() {
  const {
    append,
    remove,
    appendSource,
    allocations,
    step3Form,
    step4Form,
    step6Form,
    enqueueSave,
    saveSectionRef,
    queueAutosave,
  } = useTokenForm()

  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [image, setImage] = useState<PastedImage | null>(null)
  const [sourceUrl, setSourceUrl] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<ImportSuggestions | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const pendingRef = useRef<PendingImport | null>(null)

  /**
   * Post-save bridge. Vesting rows and attribution rows only exist once the
   * allocation section has been saved and rows carry their DB ids (the save
   * resets Step 4's schedules from the DB, wiping anything set earlier). So
   * the dialog parks vesting and attribution intents here and applies them
   * when the saved allocations come back, matched by label.
   */
  useEffect(() => {
    const pending = pendingRef.current
    if (!pending || allocations.length === 0) return

    const matchedSegmentIds: string[] = []
    const matchedVestingIds: string[] = []
    let vestingApplied = false

    for (const alloc of allocations) {
      if (pending.segmentLabels.has(alloc.label)) {
        matchedSegmentIds.push(alloc.id)
      }
      if (pending.vestingLabels.has(alloc.label)) {
        matchedVestingIds.push(alloc.id)
      }
      const vesting = pending.vestingByLabel.get(alloc.label)
      if (!vesting) continue

      const base = `schedules.${alloc.id}` as const
      /* eslint-disable @typescript-eslint/no-explicit-any -- record paths are dynamic, same pattern as Step4 */
      step4Form.setValue(`${base}.allocation_id` as any, alloc.id, {
        shouldDirty: true,
      })
      step4Form.setValue(`${base}.frequency` as any, vesting.frequency, {
        shouldDirty: true,
      })
      step4Form.setValue(
        `${base}.tge_percentage` as any,
        vesting.tge_percentage,
        {
          shouldDirty: true,
        },
      )
      step4Form.setValue(`${base}.cliff_months` as any, vesting.cliff_months, {
        shouldDirty: true,
      })
      step4Form.setValue(
        `${base}.duration_months` as any,
        vesting.duration_months,
        {
          shouldDirty: true,
        },
      )
      step4Form.setValue(
        `${base}.cliff_unlock_percentage` as any,
        vesting.cliff_unlock_percentage,
        { shouldDirty: true },
      )
      step4Form.setValue(`${base}.notes` as any, vesting.notes, {
        shouldDirty: true,
      })
      /* eslint-enable @typescript-eslint/no-explicit-any */
      pending.vestingByLabel.delete(alloc.label)
      vestingApplied = true
    }

    if (matchedSegmentIds.length === 0 && !vestingApplied) return

    // D3: pre-check the imported source on the claims it documents. Rebuild
    // with the same helper the provider effect uses so both converge.
    if (pending.sourceIndex != null && matchedSegmentIds.length > 0) {
      const idxStr = String(pending.sourceIndex)
      const current = step6Form.getValues('attributions') ?? []
      const rebuilt = buildDefaultAttributions(allocations, current)
      const updated = rebuilt.map((row) => {
        const documented =
          (row.claim_type === 'allocation_segment' &&
            row.claim_id != null &&
            matchedSegmentIds.includes(row.claim_id)) ||
          (row.claim_type === 'vesting_schedule' &&
            row.claim_id != null &&
            matchedVestingIds.includes(row.claim_id))
        if (!documented || row.data_source_ids.includes(idxStr)) return row
        return { ...row, data_source_ids: [...row.data_source_ids, idxStr] }
      })
      step6Form.setValue('attributions', updated, { shouldDirty: true })
    }

    const sourcesTouched = pending.sourceIndex != null
    if (pending.vestingByLabel.size === 0) {
      pendingRef.current = null
    } else {
      pending.segmentLabels.clear()
    }

    void (async () => {
      if (vestingApplied) {
        const valid = await step4Form.trigger()
        if (valid) await enqueueSave(() => saveSectionRef.current('vesting'))
      }
      if (sourcesTouched) {
        const valid = await step6Form.trigger()
        if (valid) await enqueueSave(() => saveSectionRef.current('sources'))
      }
    })()
  }, [allocations, step4Form, step6Form, enqueueSave, saveSectionRef])

  const attachImageFile = useCallback(async (file: File) => {
    const png = await fileToPngBase64(file)
    if (png) {
      setImage(png)
      setError(null)
    } else {
      setError('Could not read this image; save it as PNG and try again')
    }
  }, [])

  const handlePaste = useCallback(
    (event: React.ClipboardEvent) => {
      // DataTransferItems are only valid DURING the event: extract the File
      // synchronously and never touch `item` again afterwards (Safari empties
      // the list, item.type reads back as '').
      const item = Array.from(event.clipboardData.items).find(
        (i) => i.kind === 'file' && i.type.startsWith('image/'),
      )
      const file = item?.getAsFile()
      if (!file) return
      event.preventDefault()
      void attachImageFile(file)
    },
    [attachImageFile],
  )

  const resetInputs = useCallback(() => {
    setText('')
    setImage(null)
    setSourceUrl('')
    setSuggestions(null)
    setSelected(new Set())
    setError(null)
  }, [])

  const handleExtract = useCallback(async () => {
    setExtracting(true)
    setError(null)
    setSuggestions(null)
    try {
      const response = await fetch('/api/import/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.trim() || undefined,
          image: image ?? undefined,
          source_url: sourceUrl.trim() || undefined,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(payload.error ?? 'Extraction failed')
        return
      }
      const result = payload.suggestions as ImportSuggestions
      setSuggestions(result)
      setSelected(new Set(result.segments.map((_, i) => i)))
      if (result.segments.length === 0) {
        setError('No allocation data was found in this content')
      }
    } catch {
      setError('Network error, try again')
    } finally {
      setExtracting(false)
    }
  }, [text, image, sourceUrl])

  const handleApply = useCallback(() => {
    if (!suggestions) return
    const chosen = suggestions.segments.filter((_, i) => selected.has(i))
    if (chosen.length === 0) return

    const pending: PendingImport = {
      vestingByLabel: new Map(),
      segmentLabels: new Set(),
      vestingLabels: new Set(),
      sourceIndex: null,
    }

    // Sweep rows the user never touched (the seed row a fresh form starts
    // with) so imported segments don't land behind an empty, invalid first
    // row. Anything partially filled is the user's work and stays.
    const existingSegments = step3Form.getValues('segments') ?? []
    const untouched = existingSegments
      .map((seg, index) => ({ seg, index }))
      .filter(
        ({ seg }) =>
          !seg.label?.trim() &&
          !seg.percentage?.trim() &&
          !seg.segment_type &&
          !seg.token_amount?.trim() &&
          !seg.wallet_address?.trim(),
      )
      .map(({ index }) => index)
    if (untouched.length > 0) remove(untouched)

    for (const segment of chosen) {
      append({
        id: crypto.randomUUID(),
        segment_type: '',
        label: segment.label,
        percentage: segment.percentage,
        token_amount: segment.token_amount,
        wallet_address: '',
      })
      pending.segmentLabels.add(segment.label)
      if (segment.vesting) {
        pending.vestingByLabel.set(segment.label, segment.vesting)
        pending.vestingLabels.add(segment.label)
      }
    }

    const trimmedUrl = sourceUrl.trim()
    if (trimmedUrl) {
      const existing = step6Form.getValues('sources') ?? []
      pending.sourceIndex = existing.length
      appendSource({
        id: crypto.randomUUID(),
        source_type: guessSourceType(trimmedUrl),
        document_name: hostnameOf(trimmedUrl),
        url: trimmedUrl,
        version: '',
        verified_at: undefined,
      })
    }

    pendingRef.current = pending
    queueAutosave()
    toast.info(
      `${chosen.length} segment${chosen.length > 1 ? 's' : ''} imported. Set each segment type to save them.`,
    )
    setOpen(false)
    resetInputs()
  }, [
    suggestions,
    selected,
    sourceUrl,
    append,
    remove,
    appendSource,
    step3Form,
    step6Form,
    queueAutosave,
    resetInputs,
  ])

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) resetInputs()
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="w-full">
          <FileUp className="mr-2 h-4 w-4" aria-hidden />
          Import from a document
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import allocations from a document</DialogTitle>
          <DialogDescription>
            Paste text or a screenshot from a whitepaper, docs site, or vesting
            dashboard. Extracted values arrive as suggestions: nothing is saved
            until you set each segment&apos;s type.
          </DialogDescription>
        </DialogHeader>

        {!suggestions && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="import-paste">Pasted content</Label>
              <Textarea
                id="import-paste"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onPaste={handlePaste}
                placeholder="Paste copied text here, or paste a screenshot (Cmd+V) of an allocation table, vesting schedule, or pie chart."
                className="min-h-[140px]"
              />
              {image ? (
                <div className="flex items-center justify-between rounded-md border bg-surface-2 px-3 py-2 text-sm">
                  <span className="inline-flex items-center gap-2">
                    <ImageIcon
                      className="h-4 w-4 text-data-source"
                      aria-hidden
                    />
                    Image attached
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setImage(null)}
                    aria-label="Remove the attached image"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No screenshot yet:{' '}
                  <label className="cursor-pointer underline underline-offset-2 hover:text-foreground">
                    choose an image file
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) void attachImageFile(file)
                        e.target.value = ''
                      }}
                    />
                  </label>{' '}
                  or paste one above.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="import-source-url">
                Where does this come from? (optional)
              </Label>
              <Input
                id="import-source-url"
                type="url"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://docs.example.org/tokenomics"
              />
              <p className="text-xs text-muted-foreground">
                With a URL, the document joins your Sources and the imported
                data is attributed to it automatically.
              </p>
            </div>
          </div>
        )}

        {error && (
          <p className="inline-flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            {error}
          </p>
        )}

        {suggestions && suggestions.segments.length > 0 && (
          <div className="space-y-3">
            {suggestions.warnings.length > 0 && (
              <ul className="space-y-1 rounded-md border border-warning/40 bg-surface-2 p-3">
                {suggestions.warnings.map((warning, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-xs text-muted-foreground"
                  >
                    <AlertTriangle
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning"
                      aria-hidden
                    />
                    {warning}
                  </li>
                ))}
              </ul>
            )}

            <ul className="space-y-2">
              {suggestions.segments.map((segment, index) => (
                <li
                  key={index}
                  className="flex items-start gap-3 rounded-lg border bg-surface-1 p-3"
                >
                  <Checkbox
                    id={`import-segment-${index}`}
                    checked={selected.has(index)}
                    onCheckedChange={(checked) => {
                      setSelected((prev) => {
                        const next = new Set(prev)
                        if (checked === true) next.add(index)
                        else next.delete(index)
                        return next
                      })
                    }}
                    className="mt-1"
                  />
                  <label
                    htmlFor={`import-segment-${index}`}
                    className="min-w-0 flex-1 cursor-pointer space-y-1"
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{segment.label}</span>
                      {segment.percentage && (
                        <span className="tabular text-sm">
                          {segment.percentage}%
                        </span>
                      )}
                      {confidenceBadge(segment.confidence)}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {segment.dataUnavailable
                        ? 'Undocumented in the source'
                        : vestingSummary(segment.vesting)}
                    </span>
                    {segment.warnings.map((warning, wi) => (
                      <span
                        key={wi}
                        className="flex items-start gap-1.5 text-xs text-warning"
                      >
                        <AlertTriangle
                          className="mt-0.5 h-3 w-3 shrink-0"
                          aria-hidden
                        />
                        {warning}
                      </span>
                    ))}
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          {!suggestions ? (
            <>
              <p className="text-xs text-muted-foreground">
                Sent to an AI extractor; you review everything before it lands.
              </p>
              <Button
                type="button"
                onClick={handleExtract}
                disabled={extracting || (!text.trim() && !image)}
              >
                {extracting ? (
                  <>
                    <Loader2
                      className="mr-2 h-4 w-4 animate-spin"
                      aria-hidden
                    />
                    Extracting
                  </>
                ) : (
                  'Extract'
                )}
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="ghost" onClick={resetInputs}>
                Start over
              </Button>
              <Button
                type="button"
                onClick={handleApply}
                disabled={selected.size === 0}
              >
                Add {selected.size} segment{selected.size > 1 ? 's' : ''} to
                review
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
