export interface PilotRecord {
  id: string
  email: string
  displayName: string
  locale: string
  passwordHash: string
  createdAt: Date
  updatedAt: Date
}

export interface CreatePilotInput {
  email: string
  displayName: string
  locale: string
  passwordHash: string
}

export interface SessionRecord {
  id: string
  pilotId: string
  tokenHash: string
  expiresAt: Date
  createdAt: Date
}

export interface SessionWithPilot extends SessionRecord {
  pilot: PilotRecord
}

export type CreateSessionInput = Omit<SessionRecord, 'id' | 'createdAt'>

export interface PilotStore {
  create(input: CreatePilotInput): Promise<PilotRecord>
  /** Returns `null` when the email is already taken (case-insensitively). */
  createIfUnique(input: CreatePilotInput): Promise<PilotRecord | null>
  findByEmail(email: string): Promise<PilotRecord | null>
  findById(id: string): Promise<PilotRecord | null>
  updateLocale(id: string, locale: string): Promise<void>
}

export interface SessionStore {
  create(input: CreateSessionInput): Promise<SessionRecord>
  findByTokenHash(tokenHash: string): Promise<SessionWithPilot | null>
  deleteByTokenHash(tokenHash: string): Promise<void>
  deleteByPilotId(pilotId: string): Promise<void>
  /** Ownership-scoped lookup: only rows belonging to `pilotId` are visible. */
  findByIdOwnedBy(pilotId: string, sessionId: string): Promise<SessionRecord | null>
}

export interface IdentityStores {
  pilots: PilotStore
  sessions: SessionStore
}
