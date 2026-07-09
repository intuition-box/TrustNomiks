/**
 * Case-insensitive EVM address comparison. This is the single comparison
 * primitive for wallet linking (B3): the signature-recovery flow compares a
 * `recoverMessageAddress` result against the wallet address stored on the
 * nonce row, and both need to agree regardless of checksum casing.
 */
export function addressesMatch(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false

  const left = a.trim().toLowerCase()
  const right = b.trim().toLowerCase()
  if (!left || !right) return false

  return left === right
}
