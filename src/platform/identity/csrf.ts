import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * CSRF tokens bound to the current session (or, for anonymous visitors, a
 * per-browser nonce cookie). The token is an HMAC of the session identity under
 * the server secret, so it cannot be forged and is bound to exactly one
 * session — a token minted for another session fails verification.
 */
export function createCsrfToken(secret: string, identity: string): string {
  return createHmac('sha256', secret).update(identity).digest('base64url')
}

export function verifyCsrfToken(secret: string, identity: string, token: string): boolean {
  const expected = createCsrfToken(secret, identity)
  if (typeof token !== 'string' || token.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected))
}
