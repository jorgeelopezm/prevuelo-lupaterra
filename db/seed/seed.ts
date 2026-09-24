import type { PoolFacade, SqlQueryResult } from '../../src/platform/db/pool.js'
import { createAircraftRepo } from '../../src/platform/fleet/aircraft-repo.js'
import { createDocumentsRepo } from '../../src/platform/fleet/documents-repo.js'
import { createFlightRepo } from '../../src/platform/fleet/flight-repo.js'
import { createMaintenanceRepo } from '../../src/platform/fleet/maintenance-repo.js'
import { createEngineDataRepo } from '../../src/platform/fleet/engine-data-repo.js'
import { createWbRepo } from '../../src/platform/fleet/wb-repo.js'
import { createFlightIntentRepo } from '../../src/platform/risk/flight-intent-repo.js'
import { createRiskAssessmentRepo } from '../../src/platform/risk/risk-assessment-repo.js'
import { readAircraftSnapshot } from '../../src/platform/risk/aircraft-snapshot.js'
import {
  ALL_PILOT_ANSWERED_ITEM_KEYS,
  overallScore,
  scoreAllDomains,
  verdictForScore,
} from '../../src/platform/risk/scoring.js'

export interface SeedPilot {
  email: string
  displayName: string
  locale: string
  /** Memory-hard verifier (Argon2id) for the development password. */
  passwordHash: string
}

export interface SeedDocument {
  title: string
  category: string
  sourceReference: string
  locale: string
}

export interface SeedChunk {
  position: number
  content: string
  /** Fixed-dimensionality embedding serialized as pgvector text, e.g. `[0.1,0.2]`. */
  embedding: string
  documentId?: string
}

export interface SeedOptions {
  environment: string
  pilot: SeedPilot
  documents: ReadonlyArray<{ document: SeedDocument; chunks: ReadonlyArray<SeedChunk> }>
}

export interface SeedRunResult {
  pilotId: string
  counts: { pilots: number; documents: number; chunks: number }
}

/**
 * Development seed routine: creates the development pilot and sample documents
 * with deterministic mock embeddings. Repeatable — every statement is an upsert
 * keyed on a natural unique value, so a second run changes no row counts. The
 * routine aborts before writing anything when the environment is production.
 */
export async function seedDevDatabase(pool: PoolFacade, opts: SeedOptions): Promise<SeedRunResult> {
  if (opts.environment === 'production') {
    throw new Error('seed refused: cannot run the development seed in a production environment')
  }

  const pilotId = await upsertPilot(pool, opts.pilot)

  for (const { document, chunks } of opts.documents) {
    const documentId = await upsertDocument(pool, document)
    for (const chunk of chunks) {
      await insertChunk(pool, { ...chunk, documentId })
    }
  }

  const counts = await countRows(pool)
  return { pilotId, counts }
}

async function upsertPilot(pool: PoolFacade, pilot: SeedPilot): Promise<string> {
  const result: SqlQueryResult<{ id: string }> = await pool.query(
    `INSERT INTO pilots (email, display_name, locale, password_hash)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       locale = EXCLUDED.locale,
       password_hash = EXCLUDED.password_hash,
       updated_at = now()
     RETURNING id`,
    [pilot.email, pilot.displayName, pilot.locale, pilot.passwordHash],
  )
  return result.rows[0]?.id as string
}

async function upsertDocument(pool: PoolFacade, document: SeedDocument): Promise<string> {
  const result: SqlQueryResult<{ id: string }> = await pool.query(
    `INSERT INTO documents (title, category, source_reference, locale)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (source_reference) DO UPDATE SET updated_at = now()
     RETURNING id`,
    [document.title, document.category, document.sourceReference, document.locale],
  )
  return result.rows[0]?.id as string
}

async function insertChunk(pool: PoolFacade, seedChunk: SeedChunk): Promise<void> {
  await pool.query(
    `INSERT INTO document_chunks (document_id, position, content, embedding)
     VALUES ($1, $2, $3, $4::vector)
     ON CONFLICT (document_id, position) DO NOTHING`,
    [seedChunk.documentId, seedChunk.position, seedChunk.content, seedChunk.embedding],
  )
}

async function countRows(pool: PoolFacade): Promise<SeedRunResult['counts']> {
  const pilots: SqlQueryResult<{ count: string }> = await pool.query(
    'SELECT count(*) AS count FROM pilots',
  )
  const documents: SqlQueryResult<{ count: string }> = await pool.query(
    'SELECT count(*) AS count FROM documents',
  )
  const chunks: SqlQueryResult<{ count: string }> = await pool.query(
    'SELECT count(*) AS count FROM document_chunks',
  )
  return {
    pilots: Number(pilots.rows[0]?.count ?? 0),
    documents: Number(documents.rows[0]?.count ?? 0),
    chunks: Number(chunks.rows[0]?.count ?? 0),
  }
}

export interface SeedFleetResult {
  aircraftId: string
  flightCount: number
  documentCount: number
  maintenanceItemCount: number
}

/**
 * Seed one sample aircraft, a couple of flights, one airworthiness document,
 * and one maintenance item for the given pilot (aircraft-fleet /
 * flight-logbook / maintenance-tracking capabilities). Repeatable: registers
 * the aircraft only if the pilot doesn't already have one with this
 * registration, and only adds flights/documents/items when none exist yet —
 * a second run changes nothing. Every value here is clearly sample data
 * (registration `EC-DEV`), never seeded engine-monitor data, so the local
 * screen shows the real "no engine data imported" state rather than an
 * invented one.
 */
export async function seedFleetSample(
  pool: PoolFacade,
  pilotId: string,
  environment: string,
): Promise<SeedFleetResult> {
  if (environment === 'production') {
    throw new Error('seed refused: cannot run the development seed in a production environment')
  }
  const aircraftRepo = createAircraftRepo(pool)
  const flightRepo = createFlightRepo(pool)
  const documentsRepo = createDocumentsRepo(pool)
  const maintenanceRepo = createMaintenanceRepo(pool)

  const created = await aircraftRepo.create(pilotId, {
    registration: 'EC-DEV',
    icaoType: 'C172',
    manufacturer: 'Cessna',
    model: '172S (datos de muestra)',
    openingAirframeHours: 1200.0,
    openingTachHours: 1200.0,
    openingLandings: 0,
  })
  const aircraftId = created.ok
    ? created.aircraft.id
    : (await aircraftRepo.list(pilotId)).find(
        (a) => a.registration.toUpperCase().replace(/[^A-Z0-9]/g, '') === 'ECDEV',
      )?.id

  if (!aircraftId) throw new Error('seedFleetSample: could not resolve the sample aircraft')

  const existingFlights = await flightRepo.count(pilotId, { aircraftId })
  if (existingFlights === 0) {
    await flightRepo.create(pilotId, {
      aircraftId,
      kind: 'flight',
      flightDate: '2026-07-21',
      departureAerodrome: 'LEMD',
      departureTime: '10:00',
      arrivalAerodrome: 'LEBL',
      arrivalTime: '10:54',
      pilotFunction: 'pic',
      singleEngine: true,
      multiEngine: false,
      totalMinutes: 54,
      nightMinutes: 0,
      ifrMinutes: 0,
      crossCountryMinutes: 54,
      instrumentMinutes: 0,
      hobbsOut: 1200.0,
      hobbsIn: 1200.9,
      tachOut: 1200.0,
      tachIn: 1200.9,
      fuelUplift: null,
      fuelBurn: null,
      dayLandings: 1,
      nightLandings: 0,
      passengers: 1,
      remarks: 'Vuelo de muestra (datos de desarrollo)',
      deviceType: null,
      deviceQualification: null,
    })
    await flightRepo.create(pilotId, {
      aircraftId,
      kind: 'flight',
      flightDate: '2026-07-18',
      departureAerodrome: 'LEBL',
      departureTime: '09:00',
      arrivalAerodrome: 'LEMD',
      arrivalTime: '09:54',
      pilotFunction: 'pic',
      singleEngine: true,
      multiEngine: false,
      totalMinutes: 54,
      nightMinutes: 0,
      ifrMinutes: 0,
      crossCountryMinutes: 54,
      instrumentMinutes: 0,
      hobbsOut: 1199.1,
      hobbsIn: 1200.0,
      tachOut: 1199.1,
      tachIn: 1200.0,
      fuelUplift: null,
      fuelBurn: null,
      dayLandings: 1,
      nightLandings: 0,
      passengers: 0,
      remarks: 'Vuelo de muestra (datos de desarrollo)',
      deviceType: null,
      deviceQualification: null,
    })
  }

  const existingDocuments = await documentsRepo.list(pilotId, aircraftId)
  if (existingDocuments.length === 0) {
    await documentsRepo.create(pilotId, aircraftId, {
      kind: 'arc',
      reference: 'ARC-DEV-0001 (muestra)',
      issuedOn: '2026-02-01',
      expiresOn: '2027-02-01',
    })
  }

  const existingItems = await maintenanceRepo.list(pilotId, aircraftId)
  if (existingItems.length === 0) {
    await maintenanceRepo.create(pilotId, aircraftId, {
      description: 'Cambio de aceite (datos de muestra)',
      dueOn: null,
      dueAtHours: 1250.0,
      hoursBasis: 'airframe',
      recurrenceMonths: null,
      recurrenceHours: 50,
      reference: null,
    })
  }

  return {
    aircraftId,
    flightCount: await flightRepo.count(pilotId, { aircraftId }),
    documentCount: (await documentsRepo.list(pilotId, aircraftId)).length,
    maintenanceItemCount: (await maintenanceRepo.list(pilotId, aircraftId)).length,
  }
}

export interface SeedRiskResult {
  flightIntentId: string
  assessmentCount: number
}

/**
 * Seed one sample flight intent and one completed risk assessment for the
 * given pilot's sample aircraft (flight-intent / preflight-risk-assessment
 * capabilities). Repeatable: only creates the flight intent when the pilot
 * has none yet, and only records an assessment for it when none exists —
 * a second run changes nothing. Every answer is the favorable option, so the
 * sample record is a plausible low-risk evaluation rather than arbitrary data.
 */
export async function seedRiskSample(
  pool: PoolFacade,
  pilotId: string,
  aircraftId: string,
  environment: string,
): Promise<SeedRiskResult> {
  if (environment === 'production') {
    throw new Error('seed refused: cannot run the development seed in a production environment')
  }
  const flightIntentRepo = createFlightIntentRepo(pool)
  const riskAssessmentRepo = createRiskAssessmentRepo(pool)
  const flightRepo = createFlightRepo(pool)
  const maintenanceRepo = createMaintenanceRepo(pool)
  const engineDataRepo = createEngineDataRepo(pool)
  const wbRepo = createWbRepo(pool)

  const existingIntents = await flightIntentRepo.listForPilot(pilotId)
  const flightIntentId =
    existingIntents[0]?.id ??
    (await (async () => {
      const created = await flightIntentRepo.create(pilotId, {
        aircraftId,
        plannedDate: '2026-07-25',
        departureIcao: 'LEMD',
        destinationIcao: 'LEBL',
      })
      if (!created.ok) throw new Error('seedRiskSample: could not create the sample flight intent')
      return created.flightIntent.id
    })())

  const existingAssessments = await riskAssessmentRepo.listForFlightIntent(pilotId, flightIntentId)
  if (existingAssessments.length === 0) {
    const answers = ALL_PILOT_ANSWERED_ITEM_KEYS.map((itemKey) => ({ itemKey, optionIndex: 0 }))
    const aircraftSnapshot = await readAircraftSnapshot(pilotId, aircraftId, {
      flightRepo,
      maintenanceRepo,
      engineDataRepo,
      wbRepo,
    })
    const domainScores = scoreAllDomains(answers, aircraftSnapshot)
    const score = overallScore(domainScores)
    await riskAssessmentRepo.create(pilotId, {
      flightIntentId,
      answers,
      domainScores,
      overallScore: score,
      verdict: verdictForScore(score),
      aircraftSnapshot,
    })
  }

  return {
    flightIntentId,
    assessmentCount: (await riskAssessmentRepo.listForFlightIntent(pilotId, flightIntentId)).length,
  }
}

/** Deterministic mock embedding of a text at a fixed dimensionality. */
export function mockEmbedding(text: string, dimensions: number): string {
  const floats: number[] = []
  for (let i = 0; i < dimensions; i++) {
    const byte = text.charCodeAt(i % text.length) + i
    floats.push((byte % 21) / 10 - 1)
  }
  return `[${floats.join(',')}]`
}
