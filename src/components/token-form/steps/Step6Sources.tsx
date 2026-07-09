'use client'

import { format } from 'date-fns'
import { CalendarIcon, Plus, X, AlertCircle, Tag, BarChart2, PieChart, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { SOURCE_TYPE_OPTIONS } from '@/types/form'
import { useTokenForm } from '../token-form-context'
import { SectionHeader, NotReadySection } from '../section-chrome'

/** Section 6: Sources — data source table + a claim-attribution matrix (which sources back which claims). */
export function Step6Sources() {
  const {
    tokenId,
    activeSection,
    completedSteps,
    liveSourcesScore,
    step6Form,
    onSubmitStep6,
    sourceFields,
    setPendingRemoval,
    addSource,
  } = useTokenForm()

  return (
    <div
      id="section-sources"
      className={cn('overflow-hidden rounded-xl border bg-surface-1', activeSection !== 'sources' && 'hidden')}
      style={{ borderLeft: '3px solid hsl(var(--data-source))' }}
    >
      <SectionHeader accentVar="--data-source" label="Sources" desc="· Data references & attribution" liveScore={liveSourcesScore} maxScore={10} saved={completedSteps.includes(6)} />
      {!tokenId ? <NotReadySection message="Give the token a name and ticker first. The draft creates itself as you type." action={{ label: 'Go to Identity', section: 'identity' }} /> : (
      <div className="px-6 py-6">
      <Form {...step6Form}>
        <form onSubmit={step6Form.handleSubmit((data) => onSubmitStep6(data))} className="space-y-6">
          {/* Info Banner */}
          {sourceFields.length === 0 && (
            <div className="flex items-start gap-3 p-4 bg-yellow-100 dark:bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-500 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-yellow-600 dark:text-yellow-500">No sources added yet</p>
                <p className="text-muted-foreground">
                  Adding at least one source is highly recommended for data verification and credibility.
                </p>
              </div>
            </div>
          )}

          {/* Data Sources Table */}
          {sourceFields.length > 0 && (
            <div className="space-y-4">
              {sourceFields.map((field, index) => (
                <Card key={field.id} className="relative">
                  <CardContent className="pt-6">
                    {/* Remove button */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute top-2 right-2"
                      onClick={() => setPendingRemoval({ type: 'source', index })}
                    >
                      <X className="h-4 w-4" />
                    </Button>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Source Type */}
                      <FormField
                        control={step6Form.control}
                        name={`sources.${index}.source_type`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Source Type *</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select type" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {SOURCE_TYPE_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Document Name */}
                      <FormField
                        control={step6Form.control}
                        name={`sources.${index}.document_name`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Document Name *</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g. Tokenomics Whitepaper v2.0" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* URL */}
                      <FormField
                        control={step6Form.control}
                        name={`sources.${index}.url`}
                        render={({ field }) => (
                          <FormItem className="md:col-span-2">
                            <FormLabel>URL *</FormLabel>
                            <FormControl>
                              <Input
                                type="url"
                                placeholder="https://..."
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Version */}
                      <FormField
                        control={step6Form.control}
                        name={`sources.${index}.version`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Version (optional)</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g. v2.0, 2024" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Verified Date */}
                      <FormField
                        control={step6Form.control}
                        name={`sources.${index}.verified_at`}
                        render={({ field }) => (
                          <FormItem className="flex flex-col">
                            <FormLabel>Verification Date (optional)</FormLabel>
                            <Popover>
                              <PopoverTrigger asChild>
                                <FormControl>
                                  <Button
                                    variant="outline"
                                    className={cn(
                                      'w-full pl-3 text-left font-normal',
                                      !field.value && 'text-muted-foreground'
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
                                align="end"
                                side="top"
                                sideOffset={10}
                                collisionPadding={16}
                              >
                                <Calendar
                                  mode="single"
                                  selected={field.value ? new Date(field.value) : undefined}
                                  onSelect={(date) => field.onChange(date?.toISOString())}
                                  captionLayout="dropdown"
                                  fromYear={2000}
                                  toYear={2030}
                                  initialFocus
                                />
                              </PopoverContent>
                            </Popover>
                            <FormDescription className="text-xs">
                              When was this source last verified?
                            </FormDescription>
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

          {/* Add Source Button */}
          <Button
            type="button"
            variant="outline"
            onClick={addSource}
            className="w-full"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Source
          </Button>

          {/* Source Attribution — visible once at least one source has been added */}
          {sourceFields.length > 0 && (() => {
            const attributions = step6Form.watch('attributions') ?? []

            const findIdx = (type: string, claimId: string | null) =>
              attributions.findIndex(a => a.claim_type === type && (a.claim_id ?? null) === claimId)

            const allocAttrs = attributions
              .map((a, i) => ({ attr: a, idx: i }))
              .filter(({ attr }) => attr.claim_type === 'allocation_segment')

            const vestingAttrs = attributions
              .map((a, i) => ({ attr: a, idx: i }))
              .filter(({ attr }) => attr.claim_type === 'vesting_schedule')

            const tokenIdentityIdx = findIdx('token_identity', null)
            const supplyIdx = findIdx('supply_metrics', null)
            const emissionIdx = findIdx('emission_model', null)

            const renderPills = (attrIdx: number) => {
              if (attrIdx < 0 || !attributions[attrIdx]) return null
              const attr = attributions[attrIdx]
              return (
                <div className="flex flex-wrap gap-1.5">
                  {sourceFields.map((sf, srcIdx) => {
                    const srcLabel = step6Form.watch(`sources.${srcIdx}.document_name`) || `Source ${srcIdx + 1}`
                    const isSelected = attr.data_source_ids.includes(srcIdx.toString())
                    return (
                      <button
                        key={sf.id}
                        type="button"
                        onClick={() => {
                          const current = step6Form.getValues('attributions') ?? []
                          const updated = current.map((a, i) => {
                            if (i !== attrIdx) return a
                            const ids = a.data_source_ids.includes(srcIdx.toString())
                              ? a.data_source_ids.filter(id => id !== srcIdx.toString())
                              : [...a.data_source_ids, srcIdx.toString()]
                            return { ...a, data_source_ids: ids }
                          })
                          step6Form.setValue('attributions', updated)
                        }}
                        className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                          isSelected
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border text-muted-foreground hover:border-primary/50'
                        }`}
                      >
                        {srcLabel}
                      </button>
                    )
                  })}
                </div>
              )
            }

            return (
              <div className="rounded-lg border p-4 space-y-5">
                {/* Header */}
                <div>
                  <p className="font-medium text-sm">Source Attribution</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Map each piece of data to its source(s). All optional.
                  </p>
                </div>

                {/* Token Identity */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Token Identity</span>
                  </div>
                  <div className="rounded-md border border-border/40 bg-muted/20 p-3 space-y-2">
                    <p className="text-xs text-muted-foreground">Name, ticker, chain, category, contract address</p>
                    {renderPills(tokenIdentityIdx)}
                  </div>
                </div>

                <Separator />

                {/* Supply Metrics */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <BarChart2 className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Supply Metrics</span>
                  </div>
                  <div className="rounded-md border border-border/40 bg-muted/20 p-3 space-y-2">
                    <p className="text-xs text-muted-foreground">Max supply, circulating supply, TGE supply</p>
                    {renderPills(supplyIdx)}
                  </div>
                </div>

                {allocAttrs.length > 0 && (
                  <>
                    <Separator />

                    {/* Allocations & Vesting */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-1.5">
                        <PieChart className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Allocations & Vesting</span>
                      </div>
                      <div className="pl-5 space-y-3">
                        {allocAttrs.map(({ attr, idx }) => {
                          const vestingEntry = vestingAttrs.find(v => v.attr.claim_id === attr.claim_id)
                          return (
                            <div key={attr.claim_id} className="rounded-md border border-border/40 bg-muted/20 p-3 space-y-3">
                              {/* Group header: allocation name */}
                              <p className="text-sm font-semibold">{attr.label}</p>

                              {/* Allocation segment sub-row */}
                              <div className="space-y-2">
                                <p className="text-xs font-medium text-muted-foreground">Allocation segment</p>
                                {renderPills(idx)}
                              </div>

                              {/* Vesting schedule sub-row */}
                              {vestingEntry && (
                                <div className="space-y-2">
                                  <p className="text-xs font-medium text-muted-foreground">Vesting schedule</p>
                                  {renderPills(vestingEntry.idx)}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </>
                )}

                <Separator />

                {/* Emission Model */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Emission Model</span>
                  </div>
                  <div className="rounded-md border border-border/40 bg-muted/20 p-3 space-y-2">
                    <p className="text-xs text-muted-foreground">Inflation type, burn & buyback mechanisms</p>
                    {renderPills(emissionIdx)}
                  </div>
                </div>
              </div>
            )
          })()}

        </form>
      </Form>
      </div>
      )}
    </div>
  )
}
