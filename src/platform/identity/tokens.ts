import { createHash, randomBytes } from 'node:crypto'

/** Opaque, high-entropy session identifier (never encodes account data). */
export function createOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

/** Store/compare only a digest of the opaque session token. */
export function tokenDigest(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
