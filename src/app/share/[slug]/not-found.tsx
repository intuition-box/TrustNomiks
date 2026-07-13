import Link from 'next/link'
import { Logo } from '@/components/brand/logo'

/** Dead, revoked or malformed share links all land here. */
export default function ShareNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background px-6 text-center text-foreground">
      <Logo />
      <h1 className="text-2xl font-semibold tracking-tight">
        This design link is not live
      </h1>
      <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
        The link may have been revoked by the design&apos;s owner, or it never
        existed. Ask them for a fresh one.
      </p>
      <Link
        href="/"
        className="text-sm text-primary underline-offset-4 hover:underline"
      >
        Go to TrustNomiks
      </Link>
    </div>
  )
}
