'use client'

import { Loader2, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { VESTING_FREQUENCY_OPTIONS, formatSegmentTypeLabel } from '@/types/form'
import { formatTokenAmount } from '../form-helpers'
import { useTokenForm } from '../token-form-context'
import { SectionHeader, NotReadySection } from '../section-chrome'

/** Section 4: Vesting — per-allocation schedules (cliff, duration, frequency, TGE unlock). */
export function Step4Vesting() {
  const {
    tokenId,
    activeSection,
    completedSteps,
    liveVestingScore,
    allocations,
    step4Form,
    onSubmitStep4,
    preventScrollChange,
    selectInputValue,
    handleFrequencyChange,
  } = useTokenForm()

  return (
    <div
      id="section-vesting"
      className={cn(
        'overflow-hidden rounded-xl border bg-surface-1',
        activeSection !== 'vesting' && 'hidden',
      )}
      style={{ borderLeft: '3px solid hsl(var(--data-vesting))' }}
    >
      <SectionHeader
        accentVar="--data-vesting"
        label="Vesting"
        desc="· Unlock schedules"
        liveScore={liveVestingScore}
        maxScore={20}
        saved={completedSteps.includes(4)}
      />
      {!tokenId ? (
        <NotReadySection
          message="Give the token a name and ticker first. The draft creates itself as you type."
          action={{ label: 'Go to Identity', section: 'identity' }}
        />
      ) : !completedSteps.includes(3) ? (
        <NotReadySection
          message="Vesting schedules are built from your allocation segments. Add allocations first."
          action={{ label: 'Go to Allocation', section: 'allocation' }}
        />
      ) : (
        <div className="px-6 py-6">
          {allocations.length === 0 ? (
            <div className="text-center py-12">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">
                Loading allocation segments...
              </p>
            </div>
          ) : (
            <Form {...step4Form}>
              <form
                onSubmit={step4Form.handleSubmit((data) => onSubmitStep4(data))}
                className="space-y-6"
              >
                {/* Info Banner */}
                <div className="flex items-start gap-3 p-4 bg-muted rounded-lg">
                  <Clock className="h-5 w-5 text-primary mt-0.5" />
                  <div className="text-sm space-y-1">
                    <p className="font-medium">
                      Configure vesting for {allocations.length} segments
                    </p>
                    <p className="text-muted-foreground">
                      Liquidity, Airdrop, and Funding Public segments are
                      pre-filled with immediate vesting (100% at TGE). Adjust as
                      needed for your tokenomics.
                    </p>
                  </div>
                </div>

                {/* Vesting Schedules Accordion */}
                {/* eslint-disable @typescript-eslint/no-explicit-any -- react-hook-form FieldPath cannot resolve dynamic Record<string,...> keys */}
                <Accordion type="multiple" className="space-y-4">
                  {allocations.map((allocation) => {
                    const scheduleKey = `schedules.${allocation.id}`
                    const currentFrequency = step4Form.watch(
                      `${scheduleKey}.frequency` as any,
                    )
                    const isImmediate = currentFrequency === 'immediate'

                    return (
                      <AccordionItem
                        key={allocation.id}
                        value={allocation.id}
                        className="border rounded-lg px-4"
                      >
                        <AccordionTrigger className="hover:no-underline">
                          <div className="flex w-full flex-col gap-3 pr-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex flex-wrap items-center gap-3">
                              <Badge variant="outline" className="font-mono">
                                {formatSegmentTypeLabel(
                                  allocation.segment_type,
                                )}
                              </Badge>
                              <span className="font-medium">
                                {allocation.label}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                              <span>{allocation.percentage}%</span>
                              <span className="font-mono">
                                {formatTokenAmount(allocation.token_amount)}
                              </span>
                              {isImmediate && (
                                <Badge className="bg-green-100 dark:bg-green-500/10 text-green-600 dark:text-green-500 border-green-500/20">
                                  Immediate
                                </Badge>
                              )}
                            </div>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="pt-4 pb-2">
                          <div className="grid grid-cols-1 @lg/form:grid-cols-2 gap-4">
                            {/* Frequency */}
                            <FormField
                              control={step4Form.control}
                              name={`${scheduleKey}.frequency` as any}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Vesting Frequency</FormLabel>
                                  <Select
                                    onValueChange={(value) => {
                                      field.onChange(value)
                                      handleFrequencyChange(
                                        allocation.id,
                                        value,
                                      )
                                    }}
                                    defaultValue={field.value}
                                  >
                                    <FormControl>
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select frequency" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      {VESTING_FREQUENCY_OPTIONS.map(
                                        (option) => (
                                          <SelectItem
                                            key={option.value}
                                            value={option.value}
                                          >
                                            {option.label}
                                          </SelectItem>
                                        ),
                                      )}
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {/* TGE Unlock */}
                            <FormField
                              control={step4Form.control}
                              name={`${scheduleKey}.tge_percentage` as any}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>TGE Unlock (%)</FormLabel>
                                  <FormControl>
                                    <Input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      max="100"
                                      placeholder="e.g. 10"
                                      onWheel={preventScrollChange}
                                      onDoubleClick={selectInputValue}
                                      {...field}
                                      disabled={isImmediate}
                                    />
                                  </FormControl>
                                  <FormDescription className="text-xs">
                                    Percentage unlocked immediately at TGE
                                  </FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {/* Cliff Months */}
                            <FormField
                              control={step4Form.control}
                              name={`${scheduleKey}.cliff_months` as any}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Cliff Period (months)</FormLabel>
                                  <FormControl>
                                    <Input
                                      type="number"
                                      min="0"
                                      placeholder="e.g. 6"
                                      onWheel={preventScrollChange}
                                      onDoubleClick={selectInputValue}
                                      {...field}
                                      disabled={isImmediate}
                                    />
                                  </FormControl>
                                  <FormDescription className="text-xs">
                                    Lock period before vesting starts
                                  </FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {/* Cliff Unlock Percentage */}
                            <FormField
                              control={step4Form.control}
                              name={
                                `${scheduleKey}.cliff_unlock_percentage` as any
                              }
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Cliff Unlock (%)</FormLabel>
                                  <FormControl>
                                    <Input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      max="100"
                                      placeholder="e.g. 15"
                                      onWheel={preventScrollChange}
                                      onDoubleClick={selectInputValue}
                                      {...field}
                                      disabled={isImmediate}
                                    />
                                  </FormControl>
                                  <FormDescription className="text-xs">
                                    Percentage released when cliff ends
                                  </FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {/* Duration Months */}
                            <FormField
                              control={step4Form.control}
                              name={`${scheduleKey}.duration_months` as any}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>
                                    Vesting Duration (months)
                                  </FormLabel>
                                  <FormControl>
                                    <Input
                                      type="number"
                                      min="0"
                                      placeholder="e.g. 24"
                                      onWheel={preventScrollChange}
                                      onDoubleClick={selectInputValue}
                                      {...field}
                                      disabled={isImmediate}
                                    />
                                  </FormControl>
                                  <FormDescription className="text-xs">
                                    Total vesting period after cliff
                                  </FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {/* Notes */}
                            <FormField
                              control={step4Form.control}
                              name={`${scheduleKey}.notes` as any}
                              render={({ field }) => (
                                <FormItem className="@lg/form:col-span-2">
                                  <FormLabel>Notes</FormLabel>
                                  <FormControl>
                                    <Input
                                      placeholder="Additional vesting details..."
                                      {...field}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                          {/* Vesting Summary */}
                          {!isImmediate && (
                            <div className="mt-4 p-3 bg-muted/50 rounded-md text-sm">
                              <p className="font-medium mb-1">
                                Vesting Summary:
                              </p>
                              <p className="text-muted-foreground">
                                {step4Form.watch(
                                  `${scheduleKey}.tge_percentage` as any,
                                ) || '0'}
                                % unlocked at TGE
                                {step4Form.watch(
                                  `${scheduleKey}.cliff_months` as any,
                                )
                                  ? `, then ${step4Form.watch(`${scheduleKey}.cliff_months` as any)} month cliff`
                                  : ''}
                                {step4Form.watch(
                                  `${scheduleKey}.cliff_unlock_percentage` as any,
                                )
                                  ? ` (${step4Form.watch(`${scheduleKey}.cliff_unlock_percentage` as any)}% released at cliff end)`
                                  : ''}
                                {step4Form.watch(
                                  `${scheduleKey}.duration_months` as any,
                                )
                                  ? `, followed by ${step4Form.watch(`${scheduleKey}.duration_months` as any)} months of ${currentFrequency || 'monthly'} vesting`
                                  : ''}
                              </p>
                            </div>
                          )}
                        </AccordionContent>
                      </AccordionItem>
                    )
                  })}
                </Accordion>
                {/* eslint-enable @typescript-eslint/no-explicit-any */}
              </form>
            </Form>
          )}
        </div>
      )}
    </div>
  )
}
