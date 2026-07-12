'use client'

import { format } from 'date-fns'
import { CalendarIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
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
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { FACTORY_CLUSTER_MAX, formatNumber } from '@/lib/tokenomics'
import { SectionHeader } from '@/features/studio/section-chrome'
import { useFactoryForm } from '../factory-form-context'
import { FactoryNotReadySection } from './factory-not-ready'

/** Section 2: Supply — max/initial/TGE/circulating supply, source URL, notes. */
export function SupplyStep() {
  const {
    projectId,
    activeSection,
    completedSteps,
    liveSupplyScore,
    step2Form,
    onSubmitStep2,
    selectInputValue,
  } = useFactoryForm()

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
        desc="· Token supply metrics"
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
              {/* Max Supply */}
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
                      The maximum total supply of tokens (use commas for
                      readability)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Initial Supply */}
              <FormField
                control={step2Form.control}
                name="initial_supply"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Initial Supply</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. 500,000,000"
                        {...field}
                        onDoubleClick={selectInputValue}
                        onChange={(e) => {
                          const formatted = formatNumber(e.target.value)
                          field.onChange(formatted)
                        }}
                      />
                    </FormControl>
                    <FormDescription>
                      The initial minted supply at launch (optional)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* TGE Supply */}
              <FormField
                control={step2Form.control}
                name="tge_supply"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>TGE Supply</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. 100,000,000"
                        {...field}
                        onDoubleClick={selectInputValue}
                        onChange={(e) => {
                          const formatted = formatNumber(e.target.value)
                          field.onChange(formatted)
                        }}
                      />
                    </FormControl>
                    <FormDescription>
                      Tokens available at Token Generation Event (optional)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Circulating Supply */}
                <FormField
                  control={step2Form.control}
                  name="circulating_supply"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Circulating Supply</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. 250,000,000"
                          {...field}
                          onDoubleClick={selectInputValue}
                          onChange={(e) => {
                            const formatted = formatNumber(e.target.value)
                            field.onChange(formatted)
                          }}
                        />
                      </FormControl>
                      <FormDescription>
                        Projected circulating supply
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Circulating Date */}
                <FormField
                  control={step2Form.control}
                  name="circulating_date"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Circulating Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                'w-full pl-3 text-left font-normal',
                                !field.value && 'text-muted-foreground',
                              )}
                            >
                              {field.value ? (
                                format(new Date(field.value), 'PPP')
                              ) : (
                                <span>Pick a date</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent
                          className="z-[90] w-[22rem] max-w-[calc(100vw-2rem)] border-border/80 bg-card/95 p-3 shadow-2xl shadow-black/10 dark:shadow-black/50 backdrop-blur"
                          align="start"
                          sideOffset={10}
                          collisionPadding={16}
                        >
                          <Calendar
                            mode="single"
                            selected={
                              field.value ? new Date(field.value) : undefined
                            }
                            onSelect={(date) =>
                              field.onChange(date?.toISOString())
                            }
                            captionLayout="dropdown"
                            fromYear={2000}
                            toYear={2035}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormDescription>
                        Date of circulating data
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Source URL */}
              <FormField
                control={step2Form.control}
                name="source_url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Source URL</FormLabel>
                    <FormControl>
                      <Input type="url" placeholder="https://..." {...field} />
                    </FormControl>
                    <FormDescription>
                      Link to the reference behind these figures (optional)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Notes */}
              <FormField
                control={step2Form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Additional notes about supply metrics..."
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
