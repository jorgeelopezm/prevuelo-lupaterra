import type { PoolFacade } from '../db/pool.js'
import { hashPassword, verifyPassword } from './passwords.js'
import { createPilotStore } from './pilot-repo.js'
import { createSessionStore } from './session-repo.js'
import { tokenDigest, createOpaqueToken } from './tokens.js'
import type { IdentityStores, PilotRecord, SessionRecord } from './types.js'

/** SQL-backed identity stores over the shared pool facade. */
export function createSqlIdentityStores(pool: PoolFacade): IdentityStores {
  return { pilots: createPilotStore(pool), sessions: createSessionStore(pool) }
}

export interface RegisterInput {
  email: string
  displayName: string
  locale: string
  password: string
}

export type RegisterResult =
  { ok: true; pilot: PilotRecord } | { ok: false; reason: 'duplicate_email' }

export async function registerPilot(
  stores: IdentityStores,
  input: RegisterInput,
): Promise<RegisterResult> {
  const passwordHash = await hashPassword(input.password)
  const pilot = await stores.pilots.createIfUnique({
    email: input.email,
    displayName: input.displayName,
    locale: input.locale,
    passwordHash,
  })
  if (!pilot) return { ok: false, reason: 'duplicate_email' }
  return { ok: true, pilot }
}

export type SignInResult = { ok: true; pilot: PilotRecord } | { ok: false }

/**
 * Verify credentials. Returns the same `{ ok: false }` for an unknown email
 * and for a wrong password, so the caller cannot disclose whether an account
 * exists.
 */
export async function signInPilot(
  stores: IdentityStores,
  email: string,
  password: string,
): Promise<SignInResult> {
  const pilot = await stores.pilots.findByEmail(email)
  if (!pilot) return { ok: false }
  const valid = await verifyPassword(pilot.passwordHash, password)
  if (!valid) return { ok: false }
  return { ok: true, pilot }
}

export interface OpenedSession {
  /** The opaque cookie value handed to the client. */
  token: string
  record: SessionRecord
}

/**
 * Open a server-side session for a pilot: an opaque random token is issued to
 * the client while only its digest is stored. `expiresAt` enforces the absolute
 * session lifetime.
 */
export async function openSession(
  stores: IdentityStores,
  pilot: PilotRecord,
  sessionTtlHours: number,
): Promise<OpenedSession> {
  const token = createOpaqueToken()
  const expiresAt = new Date(Date.now() + sessionTtlHours * 3_600_000)
  const record = await stores.sessions.create({
    pilotId: pilot.id,
    tokenHash: tokenDigest(token),
    expiresAt,
  })
  return { token, record }
}

/** Resolve a session by its client token, checking the absolute lifetime. */
export async function resolveSessionToken(
  stores: IdentityStores,
  token: string,
): Promise<{ session: SessionRecord; pilot: PilotRecord } | null> {
  const session = await stores.sessions.findByTokenHash(tokenDigest(token))
  if (!session) return null
  if (new Date(session.expiresAt).getTime() <= Date.now()) return null
  return { session, pilot: session.pilot }
}

export async function destroySession(stores: IdentityStores, token: string): Promise<void> {
  await stores.sessions.deleteByTokenHash(tokenDigest(token))
}
