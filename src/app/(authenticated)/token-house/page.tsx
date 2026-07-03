import { redirect } from 'next/navigation'

/** Token House became the Data Room (docs/redesign/08 §8). Old links keep working. */
export default async function TokenHouseRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const qs = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (typeof value === 'string') qs.set(key, value)
  })
  const suffix = qs.size > 0 ? `?${qs.toString()}` : ''
  redirect(`/data-room${suffix}`)
}
