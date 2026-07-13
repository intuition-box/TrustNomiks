'use client'

import { useTheme } from 'next-themes'
import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Print (or save as PDF) via the browser. The page prints in the light
 * theme regardless of what the viewer reads in: paper is white, and the
 * chart tokens flip with the theme class.
 */
export function PrintButton() {
  const { resolvedTheme, setTheme } = useTheme()

  const handlePrint = () => {
    if (resolvedTheme === 'light') {
      window.print()
      return
    }
    const previous = resolvedTheme ?? 'dark'
    setTheme('light')
    // Give the theme class a beat to apply before the dialog freezes paint.
    setTimeout(() => {
      window.print()
      setTheme(previous)
    }, 200)
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="print:hidden"
      onClick={handlePrint}
    >
      <Printer className="h-4 w-4" aria-hidden />
      Print or save as PDF
    </Button>
  )
}
