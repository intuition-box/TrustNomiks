'use client'

import { format } from 'date-fns'
import { CalendarIcon, CircleHelp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
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
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  BLOCKCHAIN_OPTIONS,
  CATEGORY_OPTIONS,
  FACTORY_CLUSTER_MAX,
  isSectorCompatibleWithCategory,
} from '@/lib/tokenomics'
import { SectionHeader } from '@/features/studio/section-chrome'
import { useFactoryForm } from '../factory-form-context'

/** Section 1: Identity — name, ticker, chain, category/sector (guided), TGE date.
 *  Twin of Step1Identity with the deployed-token fields (contract address,
 *  CoinGecko link + autofill) stripped: a design has no on-chain footprint. */
export function IdentityStep() {
  const {
    activeSection,
    completedSteps,
    liveIdentityScore,
    step1Form,
    onSubmitStep1,
    identityGuideTarget,
    openIdentityGuide,
    closeIdentityGuide,
    applyCategoryFromGuide,
    applySectorFromGuide,
    selectedCategoryOption,
    sectorOptions,
  } = useFactoryForm()

  return (
    <div
      id="section-identity"
      className={cn(
        'overflow-hidden rounded-xl border bg-surface-1',
        activeSection !== 'identity' && 'hidden',
      )}
      style={{ borderLeft: '3px solid hsl(var(--data-token))' }}
    >
      <SectionHeader
        accentVar="--data-token"
        label="Identity"
        desc="· Design identification"
        liveScore={liveIdentityScore}
        maxScore={FACTORY_CLUSTER_MAX.identity}
        saved={completedSteps.includes(1)}
      />
      <div className="px-6 py-6">
        <Form {...step1Form}>
          <form
            onSubmit={step1Form.handleSubmit((data) => onSubmitStep1(data))}
            className="space-y-6"
          >
            {/* Project Name */}
            <FormField
              control={step1Form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Project Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Meridian" {...field} />
                  </FormControl>
                  <FormDescription>
                    The working name of the token you are designing
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Ticker */}
            <FormField
              control={step1Form.control}
              name="ticker"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ticker Symbol *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. MRD"
                      {...field}
                      onChange={(e) =>
                        field.onChange(e.target.value.toUpperCase())
                      }
                    />
                  </FormControl>
                  <FormDescription>
                    The token&apos;s ticker symbol (automatically converted to
                    uppercase)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {/* Blockchain */}
              <FormField
                control={step1Form.control}
                name="chain"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Blockchain</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select blockchain" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {BLOCKCHAIN_OPTIONS.map((option) => (
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

              <div className="space-y-4">
                {/* Category */}
                <FormField
                  control={step1Form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <FormLabel className="mb-0">Category</FormLabel>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => openIdentityGuide('category')}
                        >
                          <CircleHelp className="mr-1 h-3.5 w-3.5" />
                          Guide
                        </Button>
                      </div>
                      <Select
                        value={field.value}
                        onValueChange={(value) => {
                          field.onChange(value)
                          const currentSector = step1Form.getValues('sector')
                          if (
                            currentSector &&
                            !isSectorCompatibleWithCategory(
                              value,
                              currentSector,
                            )
                          ) {
                            step1Form.setValue('sector', undefined, {
                              shouldDirty: true,
                              shouldValidate: true,
                              shouldTouch: true,
                            })
                          }
                        }}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {CATEGORY_OPTIONS.map((option) => (
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

                {/* Sector */}
                <FormField
                  control={step1Form.control}
                  name="sector"
                  render={({ field }) => (
                    <FormItem>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <FormLabel className="mb-0">Sector</FormLabel>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => openIdentityGuide('sector')}
                        >
                          <CircleHelp className="mr-1 h-3.5 w-3.5" />
                          Guide
                        </Button>
                      </div>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={!selectedCategoryOption}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select sector" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {sectorOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {!selectedCategoryOption && (
                        <FormDescription className="text-xs">
                          Select a category first.
                        </FormDescription>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <Sheet
              open={identityGuideTarget !== null}
              onOpenChange={(open) => {
                if (!open) closeIdentityGuide()
              }}
            >
              <SheetContent
                side="right"
                className="w-full overflow-y-auto sm:max-w-xl"
              >
                <SheetHeader>
                  <SheetTitle>
                    {identityGuideTarget === 'sector'
                      ? 'Sector Guide'
                      : 'Category Guide'}
                  </SheetTitle>
                  <SheetDescription>
                    {identityGuideTarget === 'sector'
                      ? 'Choose a sector linked to the right parent category.'
                      : 'Choose the category that best describes this project.'}
                  </SheetDescription>
                </SheetHeader>

                {identityGuideTarget === 'category' && (
                  <div className="mt-6 space-y-3">
                    {CATEGORY_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className="w-full rounded-lg border bg-card p-4 text-left transition-colors hover:bg-muted"
                        onClick={() => applyCategoryFromGuide(option.value)}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-semibold">{option.label}</p>
                          <Badge
                            variant="outline"
                            className="font-mono text-[11px]"
                          >
                            {option.value}
                          </Badge>
                        </div>
                        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                          {option.description}
                        </p>
                      </button>
                    ))}
                  </div>
                )}

                {identityGuideTarget === 'sector' && (
                  <div className="mt-6 space-y-4">
                    <div className="space-y-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Parent Category
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {CATEGORY_OPTIONS.map((option) => (
                          <Button
                            key={option.value}
                            type="button"
                            size="sm"
                            variant={
                              selectedCategoryOption?.value === option.value
                                ? 'default'
                                : 'outline'
                            }
                            onClick={() =>
                              applyCategoryFromGuide(option.value, false)
                            }
                          >
                            {option.label}
                          </Button>
                        ))}
                      </div>
                    </div>

                    {!selectedCategoryOption ? (
                      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                        Select a parent category to see the available sectors.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {sectorOptions.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            className="w-full rounded-lg border bg-card p-4 text-left transition-colors hover:bg-muted"
                            onClick={() => applySectorFromGuide(option.value)}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <p className="font-semibold">{option.label}</p>
                              <Badge
                                variant="outline"
                                className="font-mono text-[11px]"
                              >
                                {option.value}
                              </Badge>
                            </div>
                            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                              {option.description}
                            </p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </SheetContent>
            </Sheet>

            {/* TGE Date */}
            <FormField
              control={step1Form.control}
              name="tge_date"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>TGE Date (Token Generation Event)</FormLabel>
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
                        onSelect={(date) => field.onChange(date?.toISOString())}
                        captionLayout="dropdown"
                        fromYear={2000}
                        toYear={2035}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormDescription>
                    The planned token generation date (optional)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Notes */}
            <FormField
              control={step1Form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Any additional notes about this design..."
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
    </div>
  )
}
