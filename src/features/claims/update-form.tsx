'use client'

import { type FormEvent, useState } from 'react'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { HashText } from '@/components/composite/hash-text'
import { RoleGate } from '@/components/composite/role-gate'
import { useWalletLink } from '@/features/wallet-linking/use-wallet-link'
import { useOpenChallenge } from '@/features/claims/use-open-challenge'
import { encodeFieldValue } from '@/features/claims/challenge-value'
import { getFieldDef, type FieldDef } from '@/lib/claims/field-registry'
import type { ChallengeAnchor } from '@/features/claims/challenge-target'

interface UpdateFormProps {
  tokenId: string
  anchor: ChallengeAnchor
  fieldKey: string
  onSuccess: () => void
}

/**
 * Band (2), "Update" mode: propose a specific new value for the field, typed
 * per its FieldKind. reason is required.
 */
export function UpdateForm({
  tokenId,
  anchor,
  fieldKey,
  onSuccess,
}: UpdateFormProps) {
  const { links } = useWalletLink()
  const { open, isPending } = useOpenChallenge(tokenId)
  const field = getFieldDef(anchor.claimType, fieldKey)
  const currentRaw = anchor.currentValues[fieldKey]

  const [value, setValue] = useState<string>(
    initialTextValue(field, currentRaw),
  )
  const [boolValue, setBoolValue] = useState<boolean>(Boolean(currentRaw))
  const [reason, setReason] = useState('')
  const [evidenceNote, setEvidenceNote] = useState('')
  const [evidenceUrl, setEvidenceUrl] = useState('')

  const primaryLink = links.find((l) => l.is_primary) ?? links[0] ?? null
  const canSubmit = reason.trim().length > 0 && !isPending && !!primaryLink

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!primaryLink || !field) return

    const rawNewValue = field.kind === 'boolean' ? boolValue : value
    const proposedValue = encodeFieldValue(field.kind, rawNewValue)
    const snapshotValue = encodeFieldValue(field.kind, currentRaw)

    const result = await open({
      tokenId,
      claimType: anchor.claimType,
      claimId: anchor.claimId,
      fieldKey,
      challengeType: 'update',
      reason: reason.trim(),
      proposedValue,
      snapshotValue,
      evidenceUrl: evidenceUrl.trim() || undefined,
      evidenceNote: evidenceNote.trim() || undefined,
      challengerWalletAddress: primaryLink.wallet_address,
    })

    if (result) onSuccess()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="update-value">New {field?.label ?? 'value'}</Label>
        {renderValueInput(field, value, setValue, boolValue, setBoolValue)}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="update-reason">Reason (required)</Label>
        <Textarea
          id="update-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why should this change?"
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="update-evidence-note">Evidence note (optional)</Label>
        <Textarea
          id="update-evidence-note"
          value={evidenceNote}
          onChange={(e) => setEvidenceNote(e.target.value)}
          placeholder="Additional context"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="update-evidence-url">Evidence link (optional)</Label>
        <Input
          id="update-evidence-url"
          type="url"
          value={evidenceUrl}
          onChange={(e) => setEvidenceUrl(e.target.value)}
          placeholder="https://"
        />
      </div>

      <RoleGate
        title="Link a wallet to propose an update"
        reason="Proposing an update ties the challenge to a wallet you have proven ownership of. Link one to continue."
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
            <Button type="submit" variant="brand" disabled={!canSubmit}>
              <Pencil className="h-4 w-4" aria-hidden />
              {isPending ? 'Submitting…' : 'Propose update'}
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

function initialTextValue(field: FieldDef | undefined, raw: unknown): string {
  if (raw === null || raw === undefined) return ''
  if (field?.kind === 'date') return String(raw).slice(0, 10)
  return String(raw)
}

function renderValueInput(
  field: FieldDef | undefined,
  value: string,
  setValue: (v: string) => void,
  boolValue: boolean,
  setBoolValue: (v: boolean) => void,
) {
  switch (field?.kind) {
    case 'boolean':
      return (
        <div className="flex items-center gap-2">
          <Switch
            id="update-value"
            checked={boolValue}
            onCheckedChange={setBoolValue}
          />
          <span className="text-sm text-muted-foreground">
            {boolValue ? 'Yes' : 'No'}
          </span>
        </div>
      )
    case 'enum':
      if (field.enumValues && field.enumValues.length > 0) {
        return (
          <Select value={value} onValueChange={setValue}>
            <SelectTrigger id="update-value">
              <SelectValue placeholder="Select a value" />
            </SelectTrigger>
            <SelectContent>
              {field.enumValues.map((ev) => (
                <SelectItem key={ev} value={ev}>
                  {ev}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )
      }
      return (
        <Input
          id="update-value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      )
    case 'number':
    case 'percentage':
      return (
        <Input
          id="update-value"
          type="number"
          inputMode="decimal"
          step="any"
          className="tabular"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      )
    case 'date':
      return (
        <Input
          id="update-value"
          type="date"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      )
    case 'text':
    default:
      return (
        <Input
          id="update-value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      )
  }
}
