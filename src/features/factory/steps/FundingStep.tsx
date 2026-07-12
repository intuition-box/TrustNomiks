'use client'

import { format } from 'date-fns'
import { Banknote, CalendarIcon, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
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
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  FUNDING_ROUND_TYPE_OPTIONS,
  calculateRoundAmount,
  formatNumber,
  formatUsd,
  summarizeFundingRounds,
} from '@/lib/tokenomics'
import { SectionHeader } from '@/features/studio/section-chrome'
import { useFactoryForm } from '../factory-form-context'
import { FactoryNotReadySection } from './factory-not-ready'

/** Section 6: Funding — the fundraising plan (rounds, prices, amounts).
 *  Factory-only, optional and unscored: it informs the design, not the score. */
export function FundingStep() {
  const {
    projectId,
    maxSupply,
    activeSection,
    completedSteps,
    step6Form,
    onSubmitStep6,
    roundFields,
    addRound,
    setPendingRemoval,
    preventScrollChange,
    selectInputValue,
    _lw6rounds,
  } = useFactoryForm()

  const summary = summarizeFundingRounds(_lw6rounds, maxSupply)

  return (
    <div
      id="section-funding"
      className={cn(
        'overflow-hidden rounded-xl border bg-surface-1',
        activeSection !== 'funding' && 'hidden',
      )}
      style={{ borderLeft: '3px solid hsl(var(--data-wallet))' }}
    >
      <SectionHeader
        accentVar="--data-wallet"
        label="Funding"
        desc="· Fundraising plan"
        liveScore={_lw6rounds.length > 0 ? 1 : 0}
        maxScore={0}
        saved={completedSteps.includes(6)}
      />
      {!projectId ? (
        <FactoryNotReadySection
          message="Give the design a name and ticker first. The draft creates itself as you type."
          action={{ label: 'Go to Identity', section: 'identity' }}
        />
      ) : (
        <div className="px-6 py-6">
          <Form {...step6Form}>
            <form
              onSubmit={step6Form.handleSubmit((data) => onSubmitStep6(data))}
              className="space-y-6"
            >
              {/* Summary bar (color paired with the glyph, numbers tabular) */}
              {summary.roundCount > 0 && (
                <div className="space-y-1.5 rounded-lg border bg-surface-2/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                      <Banknote
                        className="h-4 w-4"
                        style={{ color: 'hsl(var(--data-wallet))' }}
                        aria-hidden
                      />
                      Total raised
                    </span>
                    <span className="tabular text-sm font-semibold">
                      ${formatUsd(summary.totalRaisedUsd)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    <span className="tabular">
                      {formatNumber(String(summary.totalTokensSold))}
                    </span>{' '}
                    tokens sold across{' '}
                    <span className="tabular">{summary.roundCount}</span> round
                    {summary.roundCount === 1 ? '' : 's'}
                    {summary.pctOfMaxSupply !== null && (
                      <>
                        {' '}
                        (
                        <span className="tabular">
                          {summary.pctOfMaxSupply}
                        </span>
                        % of max supply)
                      </>
                    )}
                    {summary.impliedFdvUsd !== null && (
                      <>
                        {' '}
                        · implied FDV{' '}
                        <span className="tabular">
                          ${formatUsd(summary.impliedFdvUsd)}
                        </span>
                      </>
                    )}
                  </p>
                </div>
              )}

              {/* Round cards */}
              {roundFields.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No rounds yet. Funding is optional: add rounds to sketch how
                  the token sale finances the project.
                </p>
              ) : (
                <div className="space-y-4">
                  {roundFields.map((field, index) => (
                    <Card key={field.id} className="relative">
                      <CardContent className="pt-6">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute top-2 right-2"
                          onClick={() =>
                            setPendingRemoval({ type: 'funding', index })
                          }
                        >
                          <X className="h-4 w-4" />
                        </Button>

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                          {/* Round type */}
                          <FormField
                            control={step6Form.control}
                            name={`rounds.${index}.round_type`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Round Type *</FormLabel>
                                <Select
                                  onValueChange={field.onChange}
                                  value={field.value}
                                >
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select round type" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {FUNDING_ROUND_TYPE_OPTIONS.map(
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

                          {/* Label */}
                          <FormField
                            control={step6Form.control}
                            name={`rounds.${index}.label`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Label</FormLabel>
                                <FormControl>
                                  <Input
                                    placeholder="e.g. Seed round"
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          {/* Date */}
                          <FormField
                            control={step6Form.control}
                            name={`rounds.${index}.round_date`}
                            render={({ field }) => (
                              <FormItem className="flex flex-col">
                                <FormLabel>Round Date</FormLabel>
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <FormControl>
                                      <Button
                                        variant="outline"
                                        className={cn(
                                          'w-full pl-3 text-left font-normal',
                                          !field.value &&
                                            'text-muted-foreground',
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
                                        field.value
                                          ? new Date(field.value)
                                          : undefined
                                      }
                                      onSelect={(date) =>
                                        field.onChange(date?.toISOString())
                                      }
                                      captionLayout="dropdown"
                                      fromYear={2015}
                                      toYear={2035}
                                      initialFocus
                                    />
                                  </PopoverContent>
                                </Popover>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          {/* Token price */}
                          <FormField
                            control={step6Form.control}
                            name={`rounds.${index}.token_price_usd`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Token Price (USD)</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    step="any"
                                    min="0"
                                    placeholder="e.g. 0.02"
                                    onWheel={preventScrollChange}
                                    onDoubleClick={selectInputValue}
                                    {...field}
                                    onChange={(e) => {
                                      field.onChange(e.target.value)
                                      const amount = calculateRoundAmount(
                                        e.target.value,
                                        step6Form.getValues(
                                          `rounds.${index}.tokens_sold`,
                                        ) || '',
                                      )
                                      if (amount) {
                                        step6Form.setValue(
                                          `rounds.${index}.amount_usd`,
                                          amount,
                                          { shouldValidate: false },
                                        )
                                      }
                                    }}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          {/* Tokens sold */}
                          <FormField
                            control={step6Form.control}
                            name={`rounds.${index}.tokens_sold`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Tokens Sold</FormLabel>
                                <FormControl>
                                  <Input
                                    placeholder="e.g. 50,000,000"
                                    onDoubleClick={selectInputValue}
                                    {...field}
                                    onChange={(e) => {
                                      const formatted = formatNumber(
                                        e.target.value,
                                      )
                                      field.onChange(formatted)
                                      const amount = calculateRoundAmount(
                                        step6Form.getValues(
                                          `rounds.${index}.token_price_usd`,
                                        ) || '',
                                        formatted,
                                      )
                                      if (amount) {
                                        step6Form.setValue(
                                          `rounds.${index}.amount_usd`,
                                          amount,
                                          { shouldValidate: false },
                                        )
                                      }
                                    }}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          {/* Amount raised */}
                          <FormField
                            control={step6Form.control}
                            name={`rounds.${index}.amount_usd`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Amount Raised (USD)</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    step="any"
                                    min="0"
                                    placeholder="Auto-calculated or enter manually"
                                    onWheel={preventScrollChange}
                                    onDoubleClick={selectInputValue}
                                    {...field}
                                  />
                                </FormControl>
                                <FormDescription className="text-xs">
                                  Auto-calculated from price and tokens, or edit
                                  manually
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          {/* Notes */}
                          <FormField
                            control={step6Form.control}
                            name={`rounds.${index}.notes`}
                            render={({ field }) => (
                              <FormItem className="md:col-span-2">
                                <FormLabel>Notes</FormLabel>
                                <FormControl>
                                  <Input
                                    placeholder="Investors, terms, lockups..."
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Add Round Button */}
              <Button
                type="button"
                variant="outline"
                onClick={addRound}
                className="w-full"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Round
              </Button>
            </form>
          </Form>
        </div>
      )}
    </div>
  )
}
