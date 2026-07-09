'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LiveGraph } from '@/components/brand/live-graph'
import { NodeGlyph } from '@/components/patterns/node-glyph'
import { cn } from '@/lib/utils'
import type { AuthMode } from '@/types/auth'

/** Supabase auth errors, translated to copy a person can act on. */
function humanAuthError(raw: string, mode: AuthMode): string {
  const msg = raw.toLowerCase()
  if (msg.includes('invalid login credentials'))
    return "That email and password don't match."
  if (msg.includes('email not confirmed'))
    return 'Check your inbox to confirm your email, then log in.'
  if (msg.includes('already registered'))
    return 'This email already has an account. Log in instead.'
  if (msg.includes('rate limit') || msg.includes('too many'))
    return 'Too many attempts. Wait a minute, then try again.'
  if (msg.includes('network') || msg.includes('fetch'))
    return 'Connection problem. Check your network and retry.'
  return mode === 'login'
    ? 'Login failed. Retry in a moment.'
    : 'Account creation failed. Retry in a moment.'
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function LoginPage() {
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string
    confirm?: string
  }>({})
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const passwordLongEnough = password.length >= 8
  const passwordsMatch = password === confirmPassword

  const validateEmailField = () => {
    if (email && !EMAIL_REGEX.test(email)) {
      setFieldErrors((f) => ({
        ...f,
        email: 'This does not look like an email address.',
      }))
      return false
    }
    setFieldErrors((f) => ({ ...f, email: undefined }))
    return true
  }

  const validateConfirmField = () => {
    if (mode === 'signup' && confirmPassword && !passwordsMatch) {
      setFieldErrors((f) => ({ ...f, confirm: 'Passwords do not match yet.' }))
      return false
    }
    setFieldErrors((f) => ({ ...f, confirm: undefined }))
    return true
  }

  const validateForm = () => {
    if (!email || !password) {
      setError('Fill in your email and password first.')
      return false
    }
    if (!EMAIL_REGEX.test(email)) {
      setError('This does not look like an email address.')
      return false
    }
    if (!passwordLongEnough) {
      setError('Your password needs at least 8 characters.')
      return false
    }
    if (mode === 'signup' && !passwordsMatch) {
      setError('Passwords do not match yet.')
      return false
    }
    return true
  }

  const handleLogin = async () => {
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (signInError) throw signInError
    router.push('/dashboard')
    router.refresh()
  }

  const handleSignup = async () => {
    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    })
    if (signUpError) throw signUpError
    if (!authData.user) throw new Error('No user created')

    // Create profile in profiles table
    const { error: profileError } = await supabase.from('profiles').insert({
      user_id: authData.user.id,
      display_name: email.split('@')[0],
      role: 'analyst',
      organization: '',
    })
    if (profileError) {
      console.error('Profile creation error:', profileError)
      // Continue anyway - profile can be created later
    }

    router.push('/dashboard')
    router.refresh()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!validateForm()) return

    setLoading(true)
    try {
      if (mode === 'login') {
        await handleLogin()
      } else {
        await handleSignup()
      }
    } catch (err: unknown) {
      console.error(`${mode} error:`, err)
      setError(humanAuthError(err instanceof Error ? err.message : '', mode))
    } finally {
      setLoading(false)
    }
  }

  const switchMode = (next: AuthMode) => {
    if (next === mode) return
    setMode(next)
    setError('')
    setFieldErrors({})
    setConfirmPassword('')
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Auth panel */}
      <div className="flex w-full flex-col justify-center px-6 py-10 sm:px-10 lg:w-[480px] lg:shrink-0 lg:border-r lg:bg-surface-1">
        <div className="mx-auto w-full max-w-sm space-y-8">
          <Image
            src="/trustnomiks_logo_final.png"
            alt="TrustNomiks"
            width={0}
            height={0}
            sizes="180px"
            className="h-11 w-auto max-w-[170px] object-contain"
            priority
          />

          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">
              {mode === 'login' ? 'Welcome back' : 'Join the graph'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {mode === 'login'
                ? 'Log in to keep structuring and exploring tokenomics.'
                : 'Create an account to start structuring tokenomics data.'}
            </p>
          </div>

          {/* Mode switch */}
          <div
            className="grid grid-cols-2 gap-1 rounded-lg bg-surface-2 p-1"
            role="tablist"
            aria-label="Authentication mode"
          >
            {(['login', 'signup'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => switchMode(m)}
                disabled={loading}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  mode === m
                    ? 'bg-surface-3 text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {m === 'login' ? 'Log in' : 'Create account'}
              </button>
            ))}
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
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={validateEmailField}
                aria-invalid={Boolean(fieldErrors.email)}
                disabled={loading}
                required
              />
              {fieldErrors.email && (
                <p className="text-xs text-destructive">{fieldErrors.email}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete={
                  mode === 'login' ? 'current-password' : 'new-password'
                }
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                required
              />
              {mode === 'signup' && (
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
              )}
            </div>

            {mode === 'signup' && (
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
                  aria-invalid={Boolean(fieldErrors.confirm)}
                  disabled={loading}
                  required
                />
                {fieldErrors.confirm && (
                  <p className="text-xs text-destructive">
                    {fieldErrors.confirm}
                  </p>
                )}
              </div>
            )}

            <Button
              type="submit"
              variant="brand"
              size="lg"
              className="w-full"
              disabled={loading}
            >
              {loading
                ? mode === 'login'
                  ? 'Logging in…'
                  : 'Creating your account…'
                : mode === 'login'
                  ? 'Log in'
                  : 'Create account'}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground">
            No wallet needed here. Connect one only when you publish on-chain.
          </p>
        </div>
      </div>

      {/* The graph greets you */}
      <div className="relative hidden flex-1 lg:block" aria-hidden>
        <div className="absolute inset-0">
          <LiveGraph mode="ambient" count={14} />
        </div>
        <div className="absolute bottom-12 left-12 max-w-md space-y-4">
          <p className="text-lg font-medium text-foreground">
            Structure, verify and publish tokenomics as a living graph.
          </p>
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <NodeGlyph type="token" size={12} /> Tokens
            </span>
            <span className="inline-flex items-center gap-1.5">
              <NodeGlyph type="triple" size={12} /> Claims
            </span>
            <span className="inline-flex items-center gap-1.5">
              <NodeGlyph type="data_source" size={12} /> Sources
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
