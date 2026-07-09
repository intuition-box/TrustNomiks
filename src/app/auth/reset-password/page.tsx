'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/** Supabase update-password errors, translated to copy a person can act on. */
function humanUpdatePasswordError(raw: string): string {
  const msg = raw.toLowerCase()
  if (msg.includes('should be at least') || msg.includes('at least 6'))
    return 'Your password needs at least 8 characters.'
  if (msg.includes('same password') || msg.includes('should be different'))
    return 'Choose a password different from your current one.'
  if (msg.includes('network') || msg.includes('fetch'))
    return 'Connection problem. Check your network and retry.'
  return 'Could not update your password. Retry in a moment.'
}

type Status = 'checking' | 'ready' | 'invalid'

export default function ResetPasswordPage() {
  const [status, setStatus] = useState<Status>('checking')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [confirmFieldError, setConfirmFieldError] = useState<
    string | undefined
  >(undefined)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const passwordLongEnough = password.length >= 8
  const passwordsMatch = password === confirmPassword

  useEffect(() => {
    let active = true

    supabase.auth.getUser().then(({ data }) => {
      if (!active) return
      setStatus(data.user ? 'ready' : 'invalid')
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return
      if (session?.user) setStatus('ready')
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const validateConfirmField = () => {
    if (confirmPassword && !passwordsMatch) {
      setConfirmFieldError('Passwords do not match yet.')
      return false
    }
    setConfirmFieldError(undefined)
    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!password) {
      setError('Enter a new password.')
      return
    }
    if (!passwordLongEnough) {
      setError('Your password needs at least 8 characters.')
      return
    }
    if (!passwordsMatch) {
      setError('Passwords do not match yet.')
      return
    }

    setLoading(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      })
      if (updateError) throw updateError
      router.push('/dashboard')
      router.refresh()
    } catch (err: unknown) {
      console.error('update password error:', err)
      setError(
        humanUpdatePasswordError(err instanceof Error ? err.message : ''),
      )
    } finally {
      setLoading(false)
    }
  }

  if (status === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">
          Checking your reset link…
        </p>
      </div>
    )
  }

  if (status === 'invalid') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="w-full max-w-sm space-y-4 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Link expired
          </h1>
          <p className="text-sm text-muted-foreground">
            This reset link is invalid or has expired.
          </p>
          <Link
            href="/login"
            className="inline-block text-sm font-medium text-primary hover:underline"
          >
            Back to login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">
            Set a new password
          </h1>
          <p className="text-sm text-muted-foreground">
            Choose a new password for your account.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {error && (
            <div
              role="alert"
              className="rounded-md border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"
            >
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              required
            />
            <p
              className={cn(
                'text-xs',
                password.length === 0
                  ? 'text-muted-foreground'
                  : passwordLongEnough
                    ? 'text-success'
                    : 'text-warning',
              )}
            >
              {passwordLongEnough ? '✓ 8+ characters' : '8+ characters'}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onBlur={validateConfirmField}
              aria-invalid={Boolean(confirmFieldError)}
              disabled={loading}
              required
            />
            {confirmFieldError && (
              <p className="text-xs text-destructive">{confirmFieldError}</p>
            )}
          </div>

          <Button
            type="submit"
            variant="brand"
            size="lg"
            className="w-full"
            disabled={loading}
          >
            {loading ? 'Updating…' : 'Update password'}
          </Button>
        </form>
      </div>
    </div>
  )
}
