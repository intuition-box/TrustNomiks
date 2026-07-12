'use client'

import { Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
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
import { EMISSION_TYPE_OPTIONS, FACTORY_CLUSTER_MAX } from '@/lib/tokenomics'
import { SectionHeader } from '@/features/studio/section-chrome'
import { useFactoryForm } from '../factory-form-context'
import { FactoryNotReadySection } from './factory-not-ready'

/** Section 5: Emission — inflation type/rate, burn and buyback mechanisms, notes. */
export function EmissionStep() {
  const {
    projectId,
    activeSection,
    completedSteps,
    liveEmissionScore,
    step5Form,
    onSubmitStep5,
    preventScrollChange,
    selectInputValue,
    inflationYearFields,
    appendInflationYear,
    removeInflationYear,
  } = useFactoryForm()

  const addInflationYear = () => {
    const years = (step5Form.getValues('inflation_schedule') ?? [])
      .map((row) => parseInt(row.year, 10))
      .filter((year) => Number.isFinite(year) && year > 0)
    appendInflationYear({
      year: String(years.length > 0 ? Math.max(...years) + 1 : 1),
      rate: '',
    })
  }

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
        maxScore={FACTORY_CLUSTER_MAX.emission}
        saved={completedSteps.includes(5)}
      />
      {!projectId ? (
        <FactoryNotReadySection
          message="Give the design a name and ticker first. The draft creates itself as you type."
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

              {/* Inflation Schedule (year-by-year overrides) */}
              {step5Form.watch('type') !== 'fixed_cap' && (
                <div className="space-y-4 p-4 border rounded-lg">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">
                      Inflation Schedule
                    </FormLabel>
                    <FormDescription>
                      Optional year-by-year rates. A year&apos;s rate applies
                      from that year on, overriding the flat annual rate above.
                    </FormDescription>
                  </div>

                  {inflationYearFields.map((field, index) => (
                    <div key={field.id} className="flex items-start gap-3">
                      <FormField
                        control={step5Form.control}
                        name={`inflation_schedule.${index}.year`}
                        render={({ field }) => (
                          <FormItem className="w-28">
                            <FormLabel>Year</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min="1"
                                step="1"
                                placeholder="1"
                                onWheel={preventScrollChange}
                                onDoubleClick={selectInputValue}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={step5Form.control}
                        name={`inflation_schedule.${index}.rate`}
                        render={({ field }) => (
                          <FormItem className="flex-1">
                            <FormLabel>Annual Rate (%)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="e.g. 8"
                                onWheel={preventScrollChange}
                                onDoubleClick={selectInputValue}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="mt-7"
                        aria-label={`Remove year ${index + 1}`}
                        onClick={() => removeInflationYear(index)}
                      >
                        <X className="h-4 w-4" aria-hidden />
                      </Button>
                    </div>
                  ))}

                  <Button
                    type="button"
                    variant="outline"
                    onClick={addInflationYear}
                    className="w-full"
                  >
                    <Plus className="mr-2 h-4 w-4" aria-hidden />
                    Add year
                  </Button>
                </div>
              )}

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
