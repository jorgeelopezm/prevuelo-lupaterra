import type { PoolFacade } from '../../platform/db/pool.js'
import {
  createSqlIdentityStores,
  openSession,
  registerPilot,
} from '../../platform/identity/identity-service.js'
import type { PilotRecord } from '../../platform/identity/types.js'
import { SESSION_COOKIE } from './auth-plugin.js'

/** Password of every pilot created by {@link createTestSession}. */
export const TEST_PILOT_PASSWORD = 'test-password-1234'

export interface TestSession {
  /** Ready-to-send `cookie` header value carrying the session. */
  cookie: string
  pilot: PilotRecord
}

/**
 * Test support: creates a pilot in the identity stores backing `pool` (the
 * same stores the app under test reads) and opens a session for it. Every app
 * route sits behind the wall and public registration is off by default, so
 * tests that are about a page rather than about sign-up authenticate here.
 */
export async function createTestSession(
  pool: PoolFacade,
  opts: { email?: string; displayName?: string; locale?: string } = {},
): Promise<TestSession> {
  const stores = createSqlIdentityStores(pool)
  const registered = await registerPilot(stores, {
    email: opts.email ?? 'piloto-prueba@example.com',
    displayName: opts.displayName ?? 'Piloto de Prueba',
    locale: opts.locale ?? 'es',
    password: TEST_PILOT_PASSWORD,
  })
  if (!registered.ok) throw new Error('test pilot already exists; pass a different email')
  const { token } = await openSession(stores, registered.pilot, 1)
  return { cookie: `${SESSION_COOKIE}=${token}`, pilot: registered.pilot }
}
