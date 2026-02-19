import { Check, Circle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FORM_STEPS } from '@/types/form'

interface TokenFormStepperProps {
  currentStep: number
  completedSteps?: number[]
  onStepClick?: (step: number) => void
}

export function TokenFormStepper({ currentStep, completedSteps = [], onStepClick }: TokenFormStepperProps) {
  const isStepCompleted = (stepId: number) => completedSteps.includes(stepId)
  const isStepAccessible = (stepId: number) => stepId <= currentStep || isStepCompleted(stepId)

  return (
    <nav aria-label="Progress" className="overflow-x-auto pb-2">
      <ol className="flex min-w-[680px] items-center justify-between sm:min-w-0">
        {FORM_STEPS.map((step, stepIdx) => {
          const completed = isStepCompleted(step.id)
          const accessible = isStepAccessible(step.id)
          const clickable = onStepClick && accessible

          return (
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
                      completed || currentStep > step.id ? 'bg-primary' : 'bg-border'
                    )}
                  />
                </div>
              )}

              {/* Step indicator */}
              <div
                className={cn(
                  'group relative flex flex-col items-center',
                  clickable && 'cursor-pointer'
                )}
                onClick={() => clickable && onStepClick(step.id)}
              >
                <span className="flex h-9 items-center relative z-10">
                  <span
                    className={cn(
                      'relative flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all duration-300',
                      completed
                        ? 'border-green-500 bg-green-500'
                        : currentStep === step.id
                        ? 'border-primary bg-primary'
                        : currentStep > step.id
                        ? 'border-primary bg-background'
                        : 'border-border bg-background',
                      clickable && 'hover:scale-110 hover:border-primary'
                    )}
                  >
                    {completed ? (
                      <Check className="h-5 w-5 text-white" />
                    ) : currentStep === step.id ? (
                      <Circle className="h-4 w-4 text-primary-foreground fill-current" />
                    ) : (
                      <span
                        className={cn(
                          'text-sm font-medium',
                          currentStep > step.id ? 'text-primary' : 'text-muted-foreground'
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
                      'text-center text-xs font-medium transition-colors sm:text-sm',
                      completed
                        ? 'text-green-500'
                        : currentStep === step.id
                        ? 'text-primary'
                        : currentStep > step.id
                        ? 'text-foreground'
                        : 'text-muted-foreground',
                      clickable && 'group-hover:text-primary'
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
          )
        })}
      </ol>
    </nav>
  )
}
