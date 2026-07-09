'use client'

import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
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
import { EMISSION_TYPE_OPTIONS } from '@/types/form'
import { useTokenForm } from '../token-form-context'
import { SectionHeader, NotReadySection } from '../section-chrome'

/** Section 5: Emission — inflation type/rate, burn and buyback mechanisms, notes. */
export function Step5Emission() {
  const {
    tokenId,
    activeSection,
    completedSteps,
    liveEmissionScore,
    step5Form,
    onSubmitStep5,
    preventScrollChange,
    selectInputValue,
  } = useTokenForm()

  return (
    <div
      id="section-emission"
      className={cn(
        'overflow-hidden rounded-xl border bg-surface-1',
        activeSection !== 'emission' && 'hidden',
      )}
      style={{ borderLeft: '3px solid hsl(var(--data-emission))' }}
    >
      <SectionHeader
        accentVar="--data-emission"
        label="Emission"
        desc="· Inflation & economic mechanisms"
        liveScore={liveEmissionScore}
        maxScore={10}
        saved={completedSteps.includes(5)}
      />
      {!tokenId ? (
        <NotReadySection
          message="Give the token a name and ticker first. The draft creates itself as you type."
          action={{ label: 'Go to Identity', section: 'identity' }}
        />
      ) : (
        <div className="px-6 py-6">
          <Form {...step5Form}>
            <form
              onSubmit={step5Form.handleSubmit((data) => onSubmitStep5(data))}
              className="space-y-6"
            >
              {/* Emission Type */}
              <FormField
                control={step5Form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Emission Type *</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select emission type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {EMISSION_TYPE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      How the token supply changes over time
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Annual Inflation Rate */}
              <FormField
                control={step5Form.control}
                name="annual_inflation_rate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Annual Inflation Rate (%)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="e.g. 2.5"
                        onWheel={preventScrollChange}
                        onDoubleClick={selectInputValue}
                        {...field}
                        disabled={step5Form.watch('type') === 'fixed_cap'}
                      />
                    </FormControl>
                    <FormDescription>
                      Fixed inflation rate per year (disabled for fixed cap
                      tokens)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Burn Mechanism */}
              <div className="space-y-4 p-4 border rounded-lg">
                <FormField
                  control={step5Form.control}
                  name="has_burn"
                  render={({ field }) => (
                    <FormItem className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">
                          Burn Mechanism
                        </FormLabel>
                        <FormDescription>
                          Does this token have a burn mechanism?
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {step5Form.watch('has_burn') && (
                  <FormField
                    control={step5Form.control}
                    name="burn_details"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Burn Details</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Describe the burn mechanism (e.g., % of fees burned, manual burns, etc.)"
                            className="min-h-[80px]"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>

              {/* Buyback Mechanism */}
              <div className="space-y-4 p-4 border rounded-lg">
                <FormField
                  control={step5Form.control}
                  name="has_buyback"
                  render={({ field }) => (
                    <FormItem className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">
                          Buyback Program
                        </FormLabel>
                        <FormDescription>
                          Does this token have a buyback program?
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {step5Form.watch('has_buyback') && (
                  <FormField
                    control={step5Form.control}
                    name="buyback_details"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Buyback Details</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Describe the buyback program (e.g., % of revenue, frequency, mechanism)"
                            className="min-h-[80px]"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>

              {/* Notes */}
              <FormField
                control={step5Form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Additional Notes</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Any additional emission details or economic mechanisms..."
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
