'use client'

import { Plus, X, ShieldAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
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
import {
  RISK_FLAG_TYPE_OPTIONS,
  RISK_SEVERITY_OPTIONS,
  getRiskFlagTypeDescription,
  normalizeRiskSeverity,
} from '@/types/form'
import { useTokenForm } from '../token-form-context'
import { SectionHeader, NotReadySection } from '../section-chrome'

/**
 * Section 7: Risk Flags — optional risk signals with type, severity, and
 * justification. Absorbed into the extraction as anticipated by the refactor
 * plan's "Exception" paragraph (Risk Flags landed before the refactor).
 */
export function Step7RiskFlags() {
  const {
    tokenId,
    activeSection,
    completedSteps,
    _lw7flags,
    step7Form,
    onSubmitStep7,
    riskFields,
    setPendingRemoval,
    addRisk,
  } = useTokenForm()

  return (
    <div
      id="section-risk"
      className={cn('overflow-hidden rounded-xl border bg-surface-1', activeSection !== 'risk' && 'hidden')}
      style={{ borderLeft: '3px solid hsl(var(--data-risk))' }}
    >
      <SectionHeader accentVar="--data-risk" label="Risk flags" desc="· Risk signals & severity" liveScore={_lw7flags.length > 0 ? 1 : 0} maxScore={0} saved={completedSteps.includes(7)} />
      {!tokenId ? <NotReadySection message="Give the token a name and ticker first. The draft creates itself as you type." action={{ label: 'Go to Identity', section: 'identity' }} /> : (
      <div className="px-6 py-6">
      <Form {...step7Form}>
        <form onSubmit={step7Form.handleSubmit((data) => onSubmitStep7(data))} className="space-y-6">
          {/* Info Banner */}
          {riskFields.length === 0 && (
            <div className="flex items-start gap-3 p-4 bg-muted rounded-lg">
              <ShieldAlert className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div className="text-sm">
                <p className="font-medium">No risk flags added yet</p>
                <p className="text-muted-foreground">
                  Record any risk signals you have identified for this token. This section is optional.
                </p>
              </div>
            </div>
          )}

          {/* Risk Flags Table */}
          {riskFields.length > 0 && (
            <div className="space-y-4">
              {riskFields.map((field, index) => {
                const selectedType = step7Form.watch(`flags.${index}.flag_type`)
                const typeDescription = getRiskFlagTypeDescription(selectedType)
                return (
                  <Card key={field.id} className="relative">
                    <CardContent className="pt-6">
                      {/* Remove button */}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute top-2 right-2"
                        onClick={() => setPendingRemoval({ type: 'risk', index })}
                      >
                        <X className="h-4 w-4" />
                      </Button>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Risk Type */}
                        <FormField
                          control={step7Form.control}
                          name={`flags.${index}.flag_type`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Risk Type *</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select risk type" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {RISK_FLAG_TYPE_OPTIONS.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {typeDescription && (
                                <FormDescription className="text-xs">
                                  {typeDescription}
                                </FormDescription>
                              )}
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        {/* Severity */}
                        <FormField
                          control={step7Form.control}
                          name={`flags.${index}.severity`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Severity *</FormLabel>
                              <Select
                                onValueChange={(value) => field.onChange(normalizeRiskSeverity(value))}
                                value={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select severity" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {RISK_SEVERITY_OPTIONS.map((option) => (
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

                        {/* Justification */}
                        <FormField
                          control={step7Form.control}
                          name={`flags.${index}.justification`}
                          render={({ field }) => (
                            <FormItem className="md:col-span-2">
                              <FormLabel>Justification (optional)</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="Explain why this risk applies to the token..."
                                  className="min-h-[80px]"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        {/* Flagged toggle */}
                        <FormField
                          control={step7Form.control}
                          name={`flags.${index}.is_flagged`}
                          render={({ field }) => (
                            <FormItem className="md:col-span-2 flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                              <div className="space-y-0.5">
                                <FormLabel className="text-base">Active Flag</FormLabel>
                                <FormDescription>
                                  Keep this on if the risk currently applies. Turn it off to record a risk that has been cleared.
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
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}

          {/* Add Risk Flag Button */}
          <Button
            type="button"
            variant="outline"
            onClick={addRisk}
            className="w-full"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Risk Flag
          </Button>

        </form>
      </Form>
      </div>
      )}
    </div>
  )
}
