import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FORM_STEPS } from '@/types/form'

interface TokenFormStepperProps {
  currentStep: number
}

export function TokenFormStepper({ currentStep }: TokenFormStepperProps) {
  return (
    <nav aria-label="Progress">
      <ol className="flex items-center justify-between">
        {FORM_STEPS.map((step, stepIdx) => (
          <li
            key={step.id}
            className={cn(
              'relative',
              stepIdx !== FORM_STEPS.length - 1 ? 'pr-8 sm:pr-20 flex-1' : ''
            )}
          >
            {/* Connector line */}
            {stepIdx !== FORM_STEPS.length - 1 && (
              <div
                className="absolute top-4 left-0 -ml-px mt-0.5 h-0.5 w-full"
                aria-hidden="true"
              >
                <div
                  className={cn(
                    'h-full transition-all duration-300',
                    currentStep > step.id ? 'bg-primary' : 'bg-border'
                  )}
                />
              </div>
            )}

            {/* Step indicator */}
            <div className="group relative flex flex-col items-center">
              <span className="flex h-9 items-center relative z-10">
                <span
                  className={cn(
                    'relative flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all duration-300',
                    currentStep > step.id
                      ? 'border-primary bg-primary'
                      : currentStep === step.id
                      ? 'border-primary bg-background'
                      : 'border-border bg-background'
                  )}
                >
                  {currentStep > step.id ? (
                    <Check className="h-5 w-5 text-primary-foreground" />
                  ) : (
                    <span
                      className={cn(
                        'text-sm font-medium',
                        currentStep === step.id ? 'text-primary' : 'text-muted-foreground'
                      )}
                    >
                      {step.id}
                    </span>
                  )}
                </span>
              </span>
              <span className="mt-2 flex flex-col items-center">
                <span
                  className={cn(
                    'text-sm font-medium transition-colors',
                    currentStep >= step.id ? 'text-foreground' : 'text-muted-foreground'
                  )}
                >
                  {step.name}
                </span>
                <span className="text-xs text-muted-foreground mt-0.5 hidden sm:block">
                  {step.description}
                </span>
              </span>
            </div>
          </li>
        ))}
      </ol>
    </nav>
  )
}
