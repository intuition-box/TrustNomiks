'use client'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  listFields,
  type ChallengeableClaimType,
} from '@/lib/claims/field-registry'

interface FieldPickerProps {
  claimType: ChallengeableClaimType
  value: string | null
  onChange: (fieldKey: string) => void
  className?: string
}

/**
 * A6: for row-anchored claims (allocation_segment, vesting_schedule) the
 * user must pick which field of the row they are challenging before bands
 * (1)/(2)/(4) have a concrete field to work with.
 */
export function FieldPicker({
  claimType,
  value,
  onChange,
  className,
}: FieldPickerProps) {
  const fields = listFields(claimType)

  return (
    <div
      role="group"
      aria-label="Field to challenge"
      className={cn('flex flex-wrap gap-1.5', className)}
    >
      {fields.map((field) => (
        <Button
          key={field.key}
          type="button"
          size="sm"
          variant={value === field.key ? 'default' : 'outline'}
          aria-pressed={value === field.key}
          onClick={() => onChange(field.key)}
        >
          {field.label}
        </Button>
      ))}
    </div>
  )
}
