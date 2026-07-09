'use client'

import { Plus, X, AlertCircle, CheckCircle2, CircleHelp, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
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
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { SEGMENT_TYPE_OPTIONS } from '@/types/form'
import { calculateTokenAmount, calculatePercentage } from '../form-helpers'
import { useTokenForm } from '../token-form-context'
import { SectionHeader, NotReadySection } from '../section-chrome'

/** Section 3: Allocation — segment table with a live sum bar (soft 100% gate) and a segment-type guide sheet. */
export function Step3Allocation() {
  const {
    tokenId,
    maxSupply,
    activeSection,
    completedSteps,
    liveAllocationScore,
    step3Form,
    onSubmitStep3,
    isComplete,
    totalPercentage,
    delta,
    sealKey,
    normalizeAllocations,
    fields,
    setPendingRemoval,
    openSegmentGuide,
    segmentGuideRowIndex,
    closeSegmentGuide,
    applySegmentTypeFromGuide,
    addSegment,
    preventScrollChange,
    selectInputValue,
  } = useTokenForm()

  return (
    <div
      id="section-allocation"
      className={cn('overflow-hidden rounded-xl border bg-surface-1', activeSection !== 'allocation' && 'hidden')}
      style={{ borderLeft: '3px solid hsl(var(--data-allocation))' }}
    >
      <SectionHeader accentVar="--data-allocation" label="Allocation" desc="· Token distribution" liveScore={liveAllocationScore} maxScore={20} saved={completedSteps.includes(3)} />
      {!tokenId ? <NotReadySection message="Give the token a name and ticker first. The draft creates itself as you type." action={{ label: 'Go to Identity', section: 'identity' }} /> : (
      <div className="px-6 py-6">
      <Form {...step3Form}>
        <form onSubmit={step3Form.handleSubmit((data) => onSubmitStep3(data))} className="space-y-6">
          {/* Live sum bar: the soft allocation gate (docs/redesign/08 §6) */}
          {(() => {
            const sumColor = isComplete
              ? 'hsl(var(--success))'
              : totalPercentage > 100
                ? 'hsl(var(--destructive))'
                : 'hsl(var(--warning))'
            return (
              <div
                key={sealKey}
                className="space-y-2 rounded-lg border bg-surface-2/60 p-4"
                style={
                  isComplete && sealKey > 0
                    ? {
                        animation:
                          'stake-swell var(--dur-slow, 320ms) var(--ease-spring, cubic-bezier(0.34,1.56,0.64,1))',
                      }
                    : undefined
                }
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">Total allocated</span>
                  <span className="tabular inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: sumColor }}>
                    {isComplete ? (
                      <CheckCircle2 className="h-4 w-4" aria-hidden />
                    ) : (
                      <AlertCircle className="h-4 w-4" aria-hidden />
                    )}
                    {totalPercentage.toFixed(2)}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full transition-[width,background-color] duration-300"
                    style={{ width: `${Math.min(100, totalPercentage)}%`, backgroundColor: sumColor }}
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span aria-live="polite">
                    {isComplete
                      ? 'Fully allocated: worth the full 10 points.'
                      : delta > 0
                        ? `${delta.toFixed(2)}% left to allocate. Saving works anytime; reaching 100% earns the full points.`
                        : `${Math.abs(delta).toFixed(2)}% over 100. Adjust the percentages or normalize.`}
                  </span>
                  {!isComplete && totalPercentage > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={normalizeAllocations}
                    >
                      <Sparkles className="h-3.5 w-3.5" aria-hidden />
                      Normalize to 100%
                    </Button>
                  )}
                </div>
              </div>
            )
          })()}

          {/* Allocation Segments Table */}
          <div className="space-y-4">
            {fields.map((field, index) => (
              <Card key={field.id} className="relative">
                <CardContent className="pt-6">
                  {/* Remove button */}
                  {fields.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute top-2 right-2"
                      onClick={() => setPendingRemoval({ type: 'allocation', index })}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Segment Type */}
                    <FormField
                      control={step3Form.control}
                      name={`segments.${index}.segment_type`}
                      render={({ field }) => (
                        <FormItem>
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <FormLabel className="mb-0">Segment Type *</FormLabel>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => openSegmentGuide(index)}
                            >
                              <CircleHelp className="mr-1 h-3.5 w-3.5" />
                              Guide
                            </Button>
                          </div>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {SEGMENT_TYPE_OPTIONS.map((option) => (
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

                    {/* Label */}
                    <FormField
                      control={step3Form.control}
                      name={`segments.${index}.label`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Label *</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. Early Backers" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Percentage */}
                    <FormField
                      control={step3Form.control}
                      name={`segments.${index}.percentage`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Percentage of Max Supply *</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              max="100"
                              onWheel={preventScrollChange}
                              onDoubleClick={selectInputValue}
                              placeholder="e.g. 15.5"
                              {...field}
                              onChange={(e) => {
                                field.onChange(e.target.value)
                                // Update token amount when percentage changes
                                const tokenAmount = calculateTokenAmount(e.target.value, maxSupply)
                                step3Form.setValue(`segments.${index}.token_amount`, tokenAmount, { shouldValidate: false })
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Token Amount (editable, auto-calculated) */}
                    <FormField
                      control={step3Form.control}
                      name={`segments.${index}.token_amount`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Token Amount (optional)</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="Auto-calculated or enter manually"
                              onChange={(e) => {
                                field.onChange(e.target.value)
                                // Update percentage when token amount changes
                                const percentage = calculatePercentage(e.target.value, maxSupply)
                                if (percentage) {
                                  step3Form.setValue(`segments.${index}.percentage`, percentage, { shouldValidate: false })
                                }
                              }}
                            />
                          </FormControl>
                          <FormDescription className="text-xs">
                            Auto-calculated from percentage, or edit manually
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Wallet Address */}
                    <FormField
                      control={step3Form.control}
                      name={`segments.${index}.wallet_address`}
                      render={({ field }) => (
                        <FormItem className="md:col-span-2">
                          <FormLabel>Wallet Address (optional)</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="0x..."
                              {...field}
                              className="font-mono text-sm"
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

          <Sheet
            open={segmentGuideRowIndex !== null}
            onOpenChange={(open) => {
              if (!open) closeSegmentGuide()
            }}
          >
            <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
              <SheetHeader>
                <SheetTitle>Allocation Segment Guide</SheetTitle>
                <SheetDescription>
                  Pick the segment type that best matches this allocation.
                  {segmentGuideRowIndex !== null ? ` Applying to segment #${segmentGuideRowIndex + 1}.` : ''}
                </SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-3">
                {SEGMENT_TYPE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className="w-full rounded-lg border bg-card p-4 text-left transition-colors hover:bg-muted"
                    onClick={() => applySegmentTypeFromGuide(option.value)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold">{option.label}</p>
                      <Badge variant="outline" className="font-mono text-[11px]">
                        {option.value}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {option.description}
                    </p>
                  </button>
                ))}
              </div>
            </SheetContent>
          </Sheet>

          {/* Add Segment Button */}
          <Button
            type="button"
            variant="outline"
            onClick={addSegment}
            className="w-full"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Segment
          </Button>

        </form>
      </Form>
      </div>
      )}
    </div>
  )
}
