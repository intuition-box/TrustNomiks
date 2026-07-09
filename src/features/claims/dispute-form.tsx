'use client'

import { type FormEvent, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { HashText } from '@/components/composite/hash-text'
import { RoleGate } from '@/components/composite/role-gate'
import { useWalletLink } from '@/features/wallet-linking/use-wallet-link'
import { useOpenChallenge } from '@/features/claims/use-open-challenge'
import { encodeFieldValue } from '@/features/claims/challenge-value'
import { getFieldDef } from '@/lib/claims/field-registry'
import type { ChallengeAnchor } from '@/features/claims/challenge-target'

interface DisputeFormProps {
  tokenId: string
  anchor: ChallengeAnchor
  fieldKey: string
  onSuccess: () => void
}

/**
 * Band (2), "Dispute" mode: flag the current value as wrong without
 * necessarily knowing the right one. reason is required; the optional free
 * text is stored as evidence_note, never structured (no proposed_value for a
 * dispute).
 */
export function DisputeForm({
  tokenId,
  anchor,
  fieldKey,
  onSuccess,
}: DisputeFormProps) {
  const { links } = useWalletLink()
  const { open, isPending } = useOpenChallenge(tokenId)
  const [reason, setReason] = useState('')
  const [correctValue, setCorrectValue] = useState('')
  const [evidenceUrl, setEvidenceUrl] = useState('')

  const primaryLink = links.find((l) => l.is_primary) ?? links[0] ?? null
  const canSubmit = reason.trim().length > 0 && !isPending && !!primaryLink

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!primaryLink) return

    const field = getFieldDef(anchor.claimType, fieldKey)
    const snapshotValue = encodeFieldValue(
      field?.kind ?? 'text',
      anchor.currentValues[fieldKey],
    )

    const result = await open({
      tokenId,
      claimType: anchor.claimType,
      claimId: anchor.claimId,
      fieldKey,
      challengeType: 'dispute',
      reason: reason.trim(),
      proposedValue: null,
      snapshotValue,
      evidenceUrl: evidenceUrl.trim() || undefined,
      evidenceNote: correctValue.trim() || undefined,
      challengerWalletAddress: primaryLink.wallet_address,
    })

    if (result) onSuccess()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="dispute-reason">Reason (required)</Label>
        <Textarea
          id="dispute-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why does this claim look wrong?"
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="dispute-correct-value">
          I know the correct value (optional)
        </Label>
        <Textarea
          id="dispute-correct-value"
          value={correctValue}
          onChange={(e) => setCorrectValue(e.target.value)}
          placeholder="What should this be instead?"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="dispute-evidence-url">Evidence link (optional)</Label>
        <Input
          id="dispute-evidence-url"
          type="url"
          value={evidenceUrl}
          onChange={(e) => setEvidenceUrl(e.target.value)}
          placeholder="https://"
        />
      </div>

      <RoleGate
        title="Link a wallet to open a dispute"
        reason="Disputing a claim ties the challenge to a wallet you have proven ownership of. Link one to continue."
      >
        {primaryLink ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border bg-surface-2 p-3">
            <p className="text-xs text-muted-foreground">
              Will sign with{' '}
              <HashText
                value={primaryLink.wallet_address}
                className="text-foreground"
              />
            </p>
            <Button type="submit" variant="destructive" disabled={!canSubmit}>
              <AlertCircle className="h-4 w-4" aria-hidden />
              {isPending ? 'Opening…' : 'Open dispute'}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Loading your linked wallet…
          </p>
        )}
      </RoleGate>
    </form>
  )
}
