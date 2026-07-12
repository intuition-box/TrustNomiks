'use client'

import { Rocket } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  FACTORY_CLUSTER_MAX,
  deriveTgeUnlock,
  formatNumber,
} from '@/lib/tokenomics'
import { SectionHeader } from '@/features/studio/section-chrome'
import { useFactoryForm } from '../factory-form-context'
import { FactoryNotReadySection } from './factory-not-ready'

/** Section 2: Supply — the ONE manual anchor of a design (max supply).
 *  A designed token has no observed figures: what circulates at launch is
 *  DERIVED from the allocation and vesting sections, never typed in (the
 *  screener's manual supply fields describe a token that already exists). */
export function SupplyStep() {
  const {
    projectId,
    activeSection,
    completedSteps,
    liveSupplyScore,
    step2Form,
    step4Form,
    onSubmitStep2,
    selectInputValue,
    _lw3segs,
  } = useFactoryForm()

  const maxWatch = step2Form.watch('max_supply')
  const schedulesWatch = step4Form.watch('schedules') || {}
  const tgeUnlock = deriveTgeUnlock(_lw3segs, schedulesWatch, maxWatch || '')

  return (
    <div
      id="section-supply"
      className={cn(
        'overflow-hidden rounded-xl border bg-surface-1',
        activeSection !== 'supply' && 'hidden',
      )}
      style={{ borderLeft: '3px solid hsl(var(--data-supply))' }}
    >
      <SectionHeader
        accentVar="--data-supply"
        label="Supply"
        desc="· The design's anchor"
        liveScore={liveSupplyScore}
        maxScore={FACTORY_CLUSTER_MAX.supply}
        saved={completedSteps.includes(2)}
      />
      {!projectId ? (
        <FactoryNotReadySection
          message="Give the design a name and ticker first. The draft creates itself as you type."
          action={{ label: 'Go to Identity', section: 'identity' }}
        />
      ) : (
        <div className="px-6 py-6">
          <Form {...step2Form}>
            <form
              onSubmit={step2Form.handleSubmit((data) => onSubmitStep2(data))}
              className="space-y-6"
            >
              {/* Max Supply: the one number every other section builds on */}
              <FormField
                control={step2Form.control}
                name="max_supply"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max Supply</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. 1,000,000,000"
                        {...field}
                        onDoubleClick={selectInputValue}
                        onChange={(e) => {
                          const formatted = formatNumber(e.target.value)
                          field.onChange(formatted)
                        }}
                      />
                    </FormControl>
                    <FormDescription>
                      The total number of tokens your design will ever mint.
                      Allocations, vesting and funding all build on it.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Derived launch figure: flows from vesting, never typed */}
              <div className="space-y-1.5 rounded-lg border bg-surface-2/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                    <Rocket
                      className="h-4 w-4"
                      style={{ color: 'hsl(var(--data-supply))' }}
                      aria-hidden
                    />
                    Unlocked at TGE
                  </span>
                  <span className="tabular text-sm font-semibold">
                    {tgeUnlock.tokens > 0
                      ? formatNumber(String(tgeUnlock.tokens))
                      : 'Not set'}
                    {tgeUnlock.pctOfMaxSupply !== null &&
                      tgeUnlock.tokens > 0 && (
                        <span className="ml-1.5 font-normal text-muted-foreground">
                          ({tgeUnlock.pctOfMaxSupply}%)
                        </span>
                      )}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Derived from your allocation and vesting sections: immediate
                  segments unlock fully, the others release their TGE share. It
                  updates as the design evolves.
                </p>
              </div>

              {/* Notes */}
              <FormField
                control={step2Form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Minting policy, supply rationale..."
                        className="min-h-[100px]"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>
        </div>
      )}
    </div>
  )
}
