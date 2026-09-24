import type { QueryResultRow } from 'pg'

import type { DbRow, PoolFacade, Queryable, SqlQueryResult } from './pool.js'

/**
 * In-memory PoolFacade that simulates just enough Postgres for the migration
 * runner, transaction-boundary, and seed tests: BEGIN/COMMIT/ROLLBACK tracking,
 * the `_migrations` bookkeeping table, and the handful of seed statements.
 * It is a stand-in for real PostgreSQL, never a full database.
 */
export class FakePoolFacade implements PoolFacade {
  appliedVersions = new Set<number>()
  migrationOrder: number[] = []
  beginCount = 0
  commitCount = 0
  rollbackCount = 0
  releaseCount = 0
  /** A substring that makes the fake throw, simulating a failed statement. */
  failSql: string | null = null
  seen: Array<{ sql: string; params: readonly unknown[] }> = []

  // State simulation (seed + identity).
  pilots: Array<{
    id: string
    email: string
    display_name: string
    locale: string
    password_hash: string
    created_at: Date
    updated_at: Date
    active_aircraft_id?: string | null
  }> = []
  aircraft: Array<{
    id: string
    pilot_id: string
    registration: string
    icao_type: string
    manufacturer: string
    model: string
    serial_number: string | null
    class_category: string | null
    engine: string | null
    propeller: string | null
    year_of_manufacture: number | null
    home_base: string | null
    nickname: string | null
    opening_airframe_hours: number | null
    opening_engine_hours: number | null
    opening_tach_hours: number | null
    opening_landings: number | null
    retired_at: Date | null
    created_at: Date
    updated_at: Date
    wb_empty_weight: number | null
    wb_empty_weight_arm: number | null
    wb_mtow: number | null
    wb_mlw: number | null
    wb_mzfw: number | null
    wb_usable_fuel_qty: number | null
    wb_usable_fuel_arm: number | null
    wb_mass_unit: string | null
    wb_length_unit: string | null
    engine_limits: Record<string, number> | null
  }> = []
  aircraftDocuments: Array<{
    id: string
    pilot_id: string
    aircraft_id: string
    kind: string
    reference: string | null
    issued_on: string | null
    expires_on: string | null
    created_at: Date
    updated_at: Date
  }> = []
  aircraftLoadStations: Array<{
    id: string
    pilot_id: string
    aircraft_id: string
    position: number
    name: string
    arm: number
    max_weight: number | null
  }> = []
  aircraftCgEnvelopePoints: Array<{
    id: string
    pilot_id: string
    aircraft_id: string
    position: number
    weight: number
    cg: number
  }> = []
  flightEntries: Array<{
    id: string
    pilot_id: string
    aircraft_id: string | null
    kind: string
    flight_date: string
    departure_aerodrome: string | null
    departure_time: string | null
    arrival_aerodrome: string | null
    arrival_time: string | null
    pilot_function: string
    single_engine: boolean | null
    multi_engine: boolean | null
    total_minutes: number
    night_minutes: number
    ifr_minutes: number
    cross_country_minutes: number
    instrument_minutes: number
    hobbs_out: number | null
    hobbs_in: number | null
    tach_out: number | null
    tach_in: number | null
    fuel_uplift: number | null
    fuel_burn: number | null
    day_landings: number
    night_landings: number
    passengers: number
    remarks: string | null
    device_type: string | null
    device_qualification: string | null
    created_at: Date
    updated_at: Date
  }> = []
  maintenanceItems: Array<{
    id: string
    pilot_id: string
    aircraft_id: string
    description: string
    due_on: string | null
    due_at_hours: number | null
    hours_basis: string | null
    recurrence_months: number | null
    recurrence_hours: number | null
    reference: string | null
    created_at: Date
    updated_at: Date
  }> = []
  maintenanceCompletions: Array<{
    id: string
    pilot_id: string
    maintenance_item_id: string
    completed_on: string
    completed_at_hours: number | null
    reference: string | null
    created_at: Date
  }> = []
  engineDataFiles: Array<{
    id: string
    pilot_id: string
    flight_entry_id: string
    original_filename: string
    byte_size: number
    content_digest: string
    detected_format: string
    imported_at: Date
    channels: unknown
    series: unknown
    ignored_columns: string[]
  }> = []
  sessions: Array<{
    id: string
    pilot_id: string
    token_hash: string
    expires_at: Date
    created_at: Date
  }> = []
  flightIntents: Array<{
    id: string
    pilot_id: string
    aircraft_id: string
    planned_date: string
    departure_icao: string
    destination_icao: string
    created_at: Date
  }> = []
  riskAssessments: Array<{
    id: string
    pilot_id: string
    flight_intent_id: string
    answers: unknown
    domain_scores: unknown
    overall_score: number
    verdict: string
    aircraft_snapshot: unknown
    submitted_at: Date
  }> = []
  documents: Array<{ id: string; sourceReference: string }> = []
  chunks: Array<{ documentId: string; position: number }> = []
  checklists: Array<{
    id: string
    pilot_id: string
    aircraft_id: string
    name: string
    kind: string
    role: string | null
    source: string
    template_version: number | null
    position: number
    created_at: Date
    updated_at: Date
  }> = []
  checklistItems: Array<{
    id: string
    pilot_id: string
    checklist_id: string
    text: string
    response: string | null
    position: number
    created_at: Date
    updated_at: Date
  }> = []
  checklistRuns: Array<{
    id: string
    pilot_id: string
    checklist_id: string | null
    checklist_name: string
    flight_intent_id: string
    aircraft_id: string
    started_at: Date
    completed_at: Date | null
  }> = []
  checklistRunItems: Array<{
    id: string
    pilot_id: string
    run_id: string
    checklist_item_id: string | null
    text: string
    position: number
    checked_at: Date | null
  }> = []
  private nextId = 1
  private txChanges: Array<() => void> = []
  private txRollback: Array<() => void> = []
  private inTransaction = false

  async query<Row extends QueryResultRow = DbRow>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<SqlQueryResult<Row>> {
    this.seen.push({ sql, params })
    return this.exec(sql, params) as SqlQueryResult<Row>
  }

  async withTransaction<T>(work: (tx: Queryable) => Promise<T>): Promise<T> {
    this.beginCount += 1
    this.inTransaction = true
    this.txChanges = []
    this.txRollback = []
    const tx: Queryable = {
      query: async <Row2 extends QueryResultRow = DbRow>(
        s: string,
        p: readonly unknown[] = [],
      ): Promise<SqlQueryResult<Row2>> => {
        this.seen.push({ sql: s, params: p })
        return this.exec(s, p) as SqlQueryResult<Row2>
      },
    }
    try {
      const out = await work(tx)
      for (const apply of this.txChanges) apply()
      this.txRollback = []
      this.commitCount += 1
      return out
    } catch (error) {
      this.txChanges = []
      // Undo writes applied immediately during this transaction (tables that
      // need read-your-own-write within the same transaction — see the
      // aircraft insert below), in reverse order, so a thrown hook rolls back
      // exactly like a real Postgres transaction would.
      for (const undo of this.txRollback.reverse()) undo()
      this.txRollback = []
      this.rollbackCount += 1
      throw error
    } finally {
      this.inTransaction = false
      this.releaseCount += 1
    }
  }

  async end(): Promise<void> {
    // nothing to release in memory
  }

  private exec(sql: string, params: readonly unknown[]): SqlQueryResult {
    if (this.failSql && sql.includes(this.failSql)) {
      throw new Error(`simulated statement failure: ${this.failSql}`)
    }

    // Collapse whitespace runs (including newlines/indentation from multi-line
    // template literals) to a single space before pattern-matching, so a
    // matcher written as one literal string still finds a statement that
    // wraps across lines in the real query. Existing `\s+`-based regexes below
    // still work unchanged (a single space still satisfies `\s+`).
    const lower = sql.toLowerCase().replace(/\s+/g, ' ')

    if (lower.includes('create table if not exists _migrations')) {
      return { rows: [] }
    }
    if (lower.includes('select version from _migrations')) {
      return { rows: [...this.appliedVersions].map((version) => ({ version })) }
    }
    if (lower.includes('insert into _migrations')) {
      const version = Number(params[0])
      const name = params[1] as string
      const apply = () => {
        this.appliedVersions.add(version)
        this.migrationOrder.push(version)
      }
      if (this.inTransaction) this.txChanges.push(apply)
      else apply()
      void name
      return { rows: [] }
    }

    // --- pilots ---
    if (lower.includes('insert into pilots')) {
      const email = params[0] as string
      const display_name = params[1] as string
      const locale = params[2] as string
      const password_hash = params[3] as string
      const existing = this.pilots.find((p) => p.email.toLowerCase() === email.toLowerCase())
      if (existing) {
        // `ON CONFLICT (email) DO NOTHING` reports no row on conflict.
        if (lower.includes('do nothing')) return { rows: [] }
        // Upserts (`DO UPDATE`) and plain `create` return the row id.
        return { rows: [{ id: existing.id }] }
      }
      const id = `pilot-${this.nextId++}`
      const now = new Date()
      this.pilots.push({
        id,
        email,
        display_name,
        locale,
        password_hash,
        created_at: now,
        updated_at: now,
      })
      return { rows: [{ id }] }
    }
    if (lower.includes('update pilots set locale')) {
      const id = params[0] as string
      const locale = params[1] as string
      const row = this.pilots.find((p) => p.id === id)
      if (row) row.locale = locale
      return { rows: [] }
    }
    const pilotSelect = /from pilots where (email|id) = \$1/.exec(lower)
    if (lower.includes('from pilots') && pilotSelect) {
      const value = String(params[0])
      const row = this.pilots.find((p) =>
        pilotSelect[1] === 'email' ? p.email.toLowerCase() === value.toLowerCase() : p.id === value,
      )
      return { rows: row ? [row] : [] }
    }

    // --- sessions ---
    if (lower.includes('insert into sessions')) {
      const id = `session-${this.nextId++}`
      this.sessions.push({
        id,
        pilot_id: params[0] as string,
        token_hash: params[1] as string,
        expires_at: params[2] as Date,
        created_at: new Date(),
      })
      return { rows: [{ id }] }
    }
    if (lower.includes('delete from sessions where token_hash')) {
      const tokenHash = params[0] as string
      this.sessions = this.sessions.filter((s) => s.token_hash !== tokenHash)
      return { rows: [] }
    }
    if (lower.includes('delete from sessions where pilot_id')) {
      const pilotId = params[0] as string
      this.sessions = this.sessions.filter((s) => s.pilot_id !== pilotId)
      return { rows: [] }
    }
    const sessionJoin =
      /from sessions s join pilots p on p\.id = s\.pilot_id\s+where s\.token_hash = \$1/.exec(lower)
    if (sessionJoin) {
      const tokenHash = params[0] as string
      const session = this.sessions.find((s) => s.token_hash === tokenHash)
      if (!session) return { rows: [] }
      const pilot = this.pilots.find((p) => p.id === session.pilot_id)
      if (!pilot) return { rows: [] }
      return {
        rows: [
          {
            id: session.id,
            pilot_id: session.pilot_id,
            token_hash: session.token_hash,
            expires_at: session.expires_at,
            created_at: session.created_at,
            pilot__id: pilot.id,
            pilot__email: pilot.email,
            pilot__display_name: pilot.display_name,
            pilot__locale: pilot.locale,
            pilot__password_hash: pilot.password_hash,
            pilot__created_at: pilot.created_at,
            pilot__updated_at: pilot.updated_at,
          },
        ],
      }
    }
    const ownedSession = /from sessions\s+where id = \$1 and pilot_id = \$2/.exec(lower)
    if (ownedSession) {
      const sessionId = params[0] as string
      const pilotId = params[1] as string
      const row = this.sessions.find((s) => s.id === sessionId && s.pilot_id === pilotId)
      return { rows: row ? [row] : [] }
    }

    // --- seed documents / chunks ---
    if (lower.includes('insert into documents')) {
      const title = params[0] as string
      const category = params[1] as string
      const sourceReference = params[2] as string
      const locale = params[3] as string
      const existing = this.documents.find((d) => d.sourceReference === sourceReference)
      const id = existing?.id ?? `document-${this.nextId++}`
      if (!existing) this.documents.push({ id, sourceReference })
      const row = {
        id,
        title,
        category,
        source_reference: sourceReference,
        locale,
        created_at: new Date(),
        updated_at: new Date(),
      }
      return { rows: [row] }
    }
    if (lower.includes('insert into document_chunks')) {
      const documentId = params[0] as string
      const position = Number(params[1])
      const content = params[2] as string
      const embedding = (params[3] ?? null) as string | null
      const exists = this.chunks.some((c) => c.documentId === documentId && c.position === position)
      if (!exists) this.chunks.push({ documentId, position })
      const row = {
        id: `chunk-${this.nextId++}`,
        document_id: documentId,
        position,
        content,
        embedding,
        created_at: new Date(),
      }
      return { rows: [row] }
    }

    // --- aircraft (aircraft-fleet capability) ---

    // Duplicate-registration pre-check: matches both the create/update repo
    // guard (findDuplicate) which selects `id` only.
    if (lower.includes('from aircraft') && lower.includes('regexp_replace')) {
      const pilotId = params[0] as string
      const normalized = params[1] as string
      const excludeId = lower.includes('and id <>') ? (params[2] as string) : undefined
      const hit = this.aircraft.some(
        (a) =>
          a.pilot_id === pilotId &&
          a.retired_at === null &&
          a.id !== excludeId &&
          a.registration.toUpperCase().replace(/[^A-Z0-9]/g, '') === normalized,
      )
      return { rows: hit ? [{ id: 'dup' }] : [] }
    }

    // Note the trailing "(": bare `insert into aircraft` would also match
    // `insert into aircraft_documents`/`aircraft_load_stations`/
    // `aircraft_cg_envelope_points` as a substring prefix.
    if (lower.includes('insert into aircraft (')) {
      const id = `aircraft-${this.nextId++}`
      const now = new Date()
      const row = {
        id,
        pilot_id: params[0] as string,
        registration: params[1] as string,
        icao_type: params[2] as string,
        manufacturer: params[3] as string,
        model: params[4] as string,
        serial_number: (params[5] ?? null) as string | null,
        class_category: (params[6] ?? null) as string | null,
        engine: (params[7] ?? null) as string | null,
        propeller: (params[8] ?? null) as string | null,
        year_of_manufacture: (params[9] ?? null) as number | null,
        home_base: (params[10] ?? null) as string | null,
        nickname: (params[11] ?? null) as string | null,
        opening_airframe_hours: (params[12] ?? null) as number | null,
        opening_engine_hours: (params[13] ?? null) as number | null,
        opening_tach_hours: (params[14] ?? null) as number | null,
        opening_landings: (params[15] ?? null) as number | null,
        retired_at: null,
        created_at: now,
        updated_at: now,
        wb_empty_weight: null,
        wb_empty_weight_arm: null,
        wb_mtow: null,
        wb_mlw: null,
        wb_mzfw: null,
        wb_usable_fuel_qty: null,
        wb_usable_fuel_arm: null,
        wb_mass_unit: null,
        wb_length_unit: null,
        engine_limits: null,
      }
      // Applied immediately, not deferred to commit: aircraft.create() (now
      // transactional) reads this row back within the same transaction via
      // findByPilotAndId, and its onAircraftCreated hook may too. A thrown
      // hook still rolls back the insert via txRollback (see
      // withTransaction's catch branch) — same net effect as the deferred
      // pattern, but visible to reads inside the transaction as real
      // Postgres would be.
      this.aircraft.push(row)
      if (this.inTransaction) {
        this.txRollback.push(() => {
          this.aircraft = this.aircraft.filter((a) => a.id !== id)
        })
      }
      return { rows: [{ id }] }
    }

    if (lower.includes('update aircraft set retired_at')) {
      const id = params[0] as string
      const pilotId = params[1] as string
      const row = this.aircraft.find(
        (a) => a.id === id && a.pilot_id === pilotId && a.retired_at === null,
      )
      if (!row) return { rows: [] }
      const apply = () => {
        row.retired_at = new Date()
      }
      if (this.inTransaction) this.txChanges.push(apply)
      else apply()
      return { rows: [{ id }] }
    }

    if (
      lower.includes('update aircraft set') &&
      lower.includes('registration = $3') &&
      lower.includes('where id = $1 and pilot_id = $2')
    ) {
      const id = params[0] as string
      const pilotId = params[1] as string
      const row = this.aircraft.find((a) => a.id === id && a.pilot_id === pilotId)
      if (row) {
        row.registration = params[2] as string
        row.icao_type = params[3] as string
        row.manufacturer = params[4] as string
        row.model = params[5] as string
        row.serial_number = (params[6] ?? null) as string | null
        row.class_category = (params[7] ?? null) as string | null
        row.engine = (params[8] ?? null) as string | null
        row.propeller = (params[9] ?? null) as string | null
        row.year_of_manufacture = (params[10] ?? null) as number | null
        row.home_base = (params[11] ?? null) as string | null
        row.nickname = (params[12] ?? null) as string | null
        row.opening_airframe_hours = (params[13] ?? null) as number | null
        row.opening_engine_hours = (params[14] ?? null) as number | null
        row.opening_tach_hours = (params[15] ?? null) as number | null
        row.opening_landings = (params[16] ?? null) as number | null
        row.updated_at = new Date()
      }
      return { rows: [] }
    }

    // Flight-intent creation's ownership pre-check (more specific than the
    // generic aircraftByIdAndPilot match below, so it must be tested first).
    if (lower.includes('from aircraft where id = $1 and pilot_id = $2 and retired_at is null')) {
      const id = params[0] as string
      const pilotId = params[1] as string
      const hit = this.aircraft.some(
        (a) => a.id === id && a.pilot_id === pilotId && a.retired_at === null,
      )
      return { rows: hit ? [{ id }] : [] }
    }

    const aircraftByIdAndPilot = /from aircraft where id = \$1 and pilot_id = \$2/.exec(lower)
    if (aircraftByIdAndPilot) {
      const id = params[0] as string
      const pilotId = params[1] as string
      const row = this.aircraft.find((a) => a.id === id && a.pilot_id === pilotId)
      return { rows: row ? [row] : [] }
    }

    if (lower.includes('from aircraft where pilot_id = $1 and retired_at is null')) {
      const pilotId = params[0] as string
      return {
        rows: this.aircraft
          .filter((a) => a.pilot_id === pilotId && a.retired_at === null)
          .sort((a, b) => a.created_at.getTime() - b.created_at.getTime()),
      }
    }
    if (lower.includes('from aircraft where pilot_id = $1 order by created_at asc')) {
      const pilotId = params[0] as string
      return {
        rows: this.aircraft
          .filter((a) => a.pilot_id === pilotId)
          .sort((a, b) => a.created_at.getTime() - b.created_at.getTime()),
      }
    }

    // --- weight & balance profile (aircraft-fleet capability) ---
    // (The plain identity/ownership select `FROM aircraft WHERE id = $1 AND
    // pilot_id = $2` above already serves WbRepo.get's aircraft-columns
    // query — its SELECT list differs but its WHERE clause matches the same
    // `aircraftByIdAndPilot` regex, and the full stored row carries the wb_*
    // fields the repo reads from it.)
    if (lower.includes('update aircraft set') && lower.includes('wb_empty_weight = $3')) {
      const id = params[0] as string
      const pilotId = params[1] as string
      const row = this.aircraft.find((a) => a.id === id && a.pilot_id === pilotId)
      if (row) {
        row.wb_empty_weight = (params[2] ?? null) as number | null
        row.wb_empty_weight_arm = (params[3] ?? null) as number | null
        row.wb_mtow = (params[4] ?? null) as number | null
        row.wb_mlw = (params[5] ?? null) as number | null
        row.wb_mzfw = (params[6] ?? null) as number | null
        row.wb_usable_fuel_qty = (params[7] ?? null) as number | null
        row.wb_usable_fuel_arm = (params[8] ?? null) as number | null
        row.wb_mass_unit = (params[9] ?? null) as string | null
        row.wb_length_unit = (params[10] ?? null) as string | null
      }
      return { rows: [] }
    }

    if (lower.includes('insert into aircraft_load_stations')) {
      const row = {
        id: `station-${this.nextId++}`,
        pilot_id: params[0] as string,
        aircraft_id: params[1] as string,
        position: Number(params[2]),
        name: params[3] as string,
        arm: Number(params[4]),
        max_weight: (params[5] ?? null) as number | null,
      }
      const apply = () => this.aircraftLoadStations.push(row)
      if (this.inTransaction) this.txChanges.push(apply)
      else apply()
      return { rows: [] }
    }
    if (lower.includes('delete from aircraft_load_stations')) {
      const pilotId = params[0] as string
      const aircraftId = params[1] as string
      const apply = () => {
        this.aircraftLoadStations = this.aircraftLoadStations.filter(
          (s) => !(s.pilot_id === pilotId && s.aircraft_id === aircraftId),
        )
      }
      if (this.inTransaction) this.txChanges.push(apply)
      else apply()
      return { rows: [] }
    }
    if (lower.includes('from aircraft_load_stations')) {
      const pilotId = params[0] as string
      const aircraftId = params[1] as string
      return {
        rows: this.aircraftLoadStations
          .filter((s) => s.pilot_id === pilotId && s.aircraft_id === aircraftId)
          .sort((a, b) => a.position - b.position),
      }
    }

    if (lower.includes('insert into aircraft_cg_envelope_points')) {
      const row = {
        id: `point-${this.nextId++}`,
        pilot_id: params[0] as string,
        aircraft_id: params[1] as string,
        position: Number(params[2]),
        weight: Number(params[3]),
        cg: Number(params[4]),
      }
      const apply = () => this.aircraftCgEnvelopePoints.push(row)
      if (this.inTransaction) this.txChanges.push(apply)
      else apply()
      return { rows: [] }
    }
    if (lower.includes('delete from aircraft_cg_envelope_points')) {
      const pilotId = params[0] as string
      const aircraftId = params[1] as string
      const apply = () => {
        this.aircraftCgEnvelopePoints = this.aircraftCgEnvelopePoints.filter(
          (p) => !(p.pilot_id === pilotId && p.aircraft_id === aircraftId),
        )
      }
      if (this.inTransaction) this.txChanges.push(apply)
      else apply()
      return { rows: [] }
    }
    if (lower.includes('from aircraft_cg_envelope_points')) {
      const pilotId = params[0] as string
      const aircraftId = params[1] as string
      return {
        rows: this.aircraftCgEnvelopePoints
          .filter((p) => p.pilot_id === pilotId && p.aircraft_id === aircraftId)
          .sort((a, b) => a.position - b.position),
      }
    }

    // --- airworthiness/document validity records (aircraft-fleet capability) ---
    if (lower.includes('insert into aircraft_documents')) {
      const now = new Date()
      const row = {
        id: `document-${this.nextId++}`,
        pilot_id: params[0] as string,
        aircraft_id: params[1] as string,
        kind: params[2] as string,
        reference: (params[3] ?? null) as string | null,
        issued_on: (params[4] ?? null) as string | null,
        expires_on: (params[5] ?? null) as string | null,
        created_at: now,
        updated_at: now,
      }
      const apply = () => this.aircraftDocuments.push(row)
      if (this.inTransaction) this.txChanges.push(apply)
      else apply()
      return { rows: [{ id: row.id }] }
    }
    if (lower.includes('from aircraft_documents where id = $1') && !lower.includes('and')) {
      const id = params[0] as string
      const row = this.aircraftDocuments.find((d) => d.id === id)
      return { rows: row ? [row] : [] }
    }
    if (lower.includes('from aircraft_documents where pilot_id = $1 and aircraft_id = $2')) {
      const pilotId = params[0] as string
      const aircraftId = params[1] as string
      return {
        rows: this.aircraftDocuments
          .filter((d) => d.pilot_id === pilotId && d.aircraft_id === aircraftId)
          .sort((a, b) => a.created_at.getTime() - b.created_at.getTime()),
      }
    }
    if (lower.includes('delete from aircraft_documents')) {
      const documentId = params[0] as string
      const pilotId = params[1] as string
      const aircraftId = params[2] as string
      const before = this.aircraftDocuments.length
      this.aircraftDocuments = this.aircraftDocuments.filter(
        (d) => !(d.id === documentId && d.pilot_id === pilotId && d.aircraft_id === aircraftId),
      )
      const removed = before !== this.aircraftDocuments.length
      return { rows: removed ? [{ id: documentId }] : [] }
    }

    // --- flight logbook (flight-logbook capability) ---
    if (lower.includes('insert into flight_entries')) {
      const now = new Date()
      const row = {
        id: `entry-${this.nextId++}`,
        pilot_id: params[0] as string,
        aircraft_id: (params[1] ?? null) as string | null,
        kind: params[2] as string,
        flight_date: params[3] as string,
        departure_aerodrome: (params[4] ?? null) as string | null,
        departure_time: (params[5] ?? null) as string | null,
        arrival_aerodrome: (params[6] ?? null) as string | null,
        arrival_time: (params[7] ?? null) as string | null,
        pilot_function: params[8] as string,
        single_engine: (params[9] ?? null) as boolean | null,
        multi_engine: (params[10] ?? null) as boolean | null,
        total_minutes: Number(params[11]),
        night_minutes: Number(params[12] ?? 0),
        ifr_minutes: Number(params[13] ?? 0),
        cross_country_minutes: Number(params[14] ?? 0),
        instrument_minutes: Number(params[15] ?? 0),
        hobbs_out: (params[16] ?? null) as number | null,
        hobbs_in: (params[17] ?? null) as number | null,
        tach_out: (params[18] ?? null) as number | null,
        tach_in: (params[19] ?? null) as number | null,
        fuel_uplift: (params[20] ?? null) as number | null,
        fuel_burn: (params[21] ?? null) as number | null,
        day_landings: Number(params[22] ?? 0),
        night_landings: Number(params[23] ?? 0),
        passengers: Number(params[24] ?? 0),
        remarks: (params[25] ?? null) as string | null,
        device_type: (params[26] ?? null) as string | null,
        device_qualification: (params[27] ?? null) as string | null,
        created_at: now,
        updated_at: now,
      }
      // Mirrors the real DB's composite FK: a flight naming an aircraft the
      // pilot does not own is rejected (design decision 6's ownership guard).
      if (row.aircraft_id) {
        const owns = this.aircraft.some(
          (a) => a.id === row.aircraft_id && a.pilot_id === row.pilot_id,
        )
        if (!owns) {
          const err = new Error('simulated FK violation') as Error & { code: string }
          err.code = '23503'
          throw err
        }
      }
      const apply = () => this.flightEntries.push(row)
      if (this.inTransaction) this.txChanges.push(apply)
      else apply()
      return { rows: [{ id: row.id }] }
    }

    if (lower.includes('update flight_entries set')) {
      const id = params[0] as string
      const pilotId = params[1] as string
      const row = this.flightEntries.find((e) => e.id === id && e.pilot_id === pilotId)
      if (row) {
        const newAircraftId = (params[2] ?? null) as string | null
        if (newAircraftId) {
          const owns = this.aircraft.some((a) => a.id === newAircraftId && a.pilot_id === pilotId)
          if (!owns) {
            const err = new Error('simulated FK violation') as Error & { code: string }
            err.code = '23503'
            throw err
          }
        }
        row.aircraft_id = newAircraftId
        row.kind = params[3] as string
        row.flight_date = params[4] as string
        row.departure_aerodrome = (params[5] ?? null) as string | null
        row.departure_time = (params[6] ?? null) as string | null
        row.arrival_aerodrome = (params[7] ?? null) as string | null
        row.arrival_time = (params[8] ?? null) as string | null
        row.pilot_function = params[9] as string
        row.single_engine = (params[10] ?? null) as boolean | null
        row.multi_engine = (params[11] ?? null) as boolean | null
        row.total_minutes = Number(params[12])
        row.night_minutes = Number(params[13] ?? 0)
        row.ifr_minutes = Number(params[14] ?? 0)
        row.cross_country_minutes = Number(params[15] ?? 0)
        row.instrument_minutes = Number(params[16] ?? 0)
        row.hobbs_out = (params[17] ?? null) as number | null
        row.hobbs_in = (params[18] ?? null) as number | null
        row.tach_out = (params[19] ?? null) as number | null
        row.tach_in = (params[20] ?? null) as number | null
        row.fuel_uplift = (params[21] ?? null) as number | null
        row.fuel_burn = (params[22] ?? null) as number | null
        row.day_landings = Number(params[23] ?? 0)
        row.night_landings = Number(params[24] ?? 0)
        row.passengers = Number(params[25] ?? 0)
        row.remarks = (params[26] ?? null) as string | null
        row.device_type = (params[27] ?? null) as string | null
        row.device_qualification = (params[28] ?? null) as string | null
        row.updated_at = new Date()
      }
      return { rows: [] }
    }

    if (lower.includes('delete from flight_entries')) {
      const id = params[0] as string
      const pilotId = params[1] as string
      const before = this.flightEntries.length
      this.flightEntries = this.flightEntries.filter(
        (e) => !(e.id === id && e.pilot_id === pilotId),
      )
      const removed = before !== this.flightEntries.length
      return { rows: removed ? [{ id }] : [] }
    }

    if (lower.includes('select count(*) as count from flight_entries where pilot_id = $1')) {
      const pilotId = params[0] as string
      const aircraftId = lower.includes('and aircraft_id = $2') ? (params[1] as string) : undefined
      const count = this.flightEntries.filter(
        (e) => e.pilot_id === pilotId && (!aircraftId || e.aircraft_id === aircraftId),
      ).length
      return { rows: [{ count: String(count) }] }
    }

    if (lower.includes('from flight_entries where id = $1 and pilot_id = $2 limit 1')) {
      const id = params[0] as string
      const pilotId = params[1] as string
      const row = this.flightEntries.find((e) => e.id === id && e.pilot_id === pilotId)
      return { rows: row ? [row] : [] }
    }

    if (
      lower.includes(
        "from flight_entries where pilot_id = $1 and aircraft_id = $2 and kind = 'flight' order by flight_date desc, created_at desc limit 1",
      )
    ) {
      const pilotId = params[0] as string
      const aircraftId = params[1] as string
      const matches = this.flightEntries
        .filter(
          (e) => e.pilot_id === pilotId && e.aircraft_id === aircraftId && e.kind === 'flight',
        )
        .sort(
          (a, b) =>
            b.flight_date.localeCompare(a.flight_date) ||
            b.created_at.getTime() - a.created_at.getTime(),
        )
      const [first] = matches
      return { rows: first ? [first] : [] }
    }

    if (lower.includes('as landings') && lower.includes('from flight_entries')) {
      const pilotId = params[0] as string
      const aircraftId = params[1] as string
      const rows = this.flightEntries.filter(
        (e) => e.pilot_id === pilotId && e.aircraft_id === aircraftId && e.kind === 'flight',
      )
      const totalMinutes = rows.reduce((sum, e) => sum + e.total_minutes, 0)
      const landings = rows.reduce((sum, e) => sum + e.day_landings + e.night_landings, 0)
      return {
        rows: [
          {
            total_minutes: String(totalMinutes),
            landings: String(landings),
            count: String(rows.length),
          },
        ],
      }
    }

    if (lower.includes('as pic_minutes')) {
      const pilotId = params[0] as string
      const cutoffIso = params[1] as string
      const all = this.flightEntries.filter((e) => e.pilot_id === pilotId)
      const flights = all.filter((e) => e.kind === 'flight')
      const sumBy = (
        pred: (e: (typeof flights)[number]) => boolean,
        field:
          | 'total_minutes'
          | 'night_minutes'
          | 'ifr_minutes'
          | 'cross_country_minutes'
          | 'instrument_minutes',
      ) => flights.filter(pred).reduce((sum, e) => sum + e[field], 0)
      const recent = flights.filter((e) => e.flight_date >= cutoffIso)
      return {
        rows: [
          {
            total_minutes: String(sumBy(() => true, 'total_minutes')),
            pic_minutes: String(sumBy((e) => e.pilot_function === 'pic', 'total_minutes')),
            spic_minutes: String(sumBy((e) => e.pilot_function === 'spic', 'total_minutes')),
            sic_minutes: String(sumBy((e) => e.pilot_function === 'sic', 'total_minutes')),
            dual_minutes: String(sumBy((e) => e.pilot_function === 'dual', 'total_minutes')),
            instructor_minutes: String(
              sumBy((e) => e.pilot_function === 'instructor', 'total_minutes'),
            ),
            night_minutes: String(sumBy(() => true, 'night_minutes')),
            ifr_minutes: String(sumBy(() => true, 'ifr_minutes')),
            cross_country_minutes: String(sumBy(() => true, 'cross_country_minutes')),
            instrument_minutes: String(sumBy(() => true, 'instrument_minutes')),
            total_landings: String(
              flights.reduce((sum, e) => sum + e.day_landings + e.night_landings, 0),
            ),
            fstd_minutes: String(
              all.filter((e) => e.kind === 'fstd').reduce((sum, e) => sum + e.total_minutes, 0),
            ),
            recent_landings: String(
              recent.reduce((sum, e) => sum + e.day_landings + e.night_landings, 0),
            ),
            recent_night_landings: String(recent.reduce((sum, e) => sum + e.night_landings, 0)),
            count: String(all.length),
          },
        ],
      }
    }

    if (lower.includes('from flight_entries where pilot_id = $1')) {
      const pilotId = params[0] as string
      const aircraftId = lower.includes('and aircraft_id = $2') ? (params[1] as string) : undefined
      const filtered = this.flightEntries
        .filter((e) => e.pilot_id === pilotId && (!aircraftId || e.aircraft_id === aircraftId))
        .sort(
          (a, b) =>
            b.flight_date.localeCompare(a.flight_date) ||
            b.created_at.getTime() - a.created_at.getTime(),
        )
      const limit = Number(params[params.length - 2])
      const offset = Number(params[params.length - 1])
      return { rows: filtered.slice(offset, offset + limit) }
    }

    // --- maintenance tracking (maintenance-tracking capability) ---
    if (lower.includes('insert into maintenance_items')) {
      const now = new Date()
      const row = {
        id: `maintenance-${this.nextId++}`,
        pilot_id: params[0] as string,
        aircraft_id: params[1] as string,
        description: params[2] as string,
        due_on: (params[3] ?? null) as string | null,
        due_at_hours: (params[4] ?? null) as number | null,
        hours_basis: (params[5] ?? null) as string | null,
        recurrence_months: (params[6] ?? null) as number | null,
        recurrence_hours: (params[7] ?? null) as number | null,
        reference: (params[8] ?? null) as string | null,
        created_at: now,
        updated_at: now,
      }
      this.maintenanceItems.push(row)
      return { rows: [{ id: row.id }] }
    }

    if (lower.includes('update maintenance_items set due_on')) {
      const id = params[0] as string
      const row = this.maintenanceItems.find((m) => m.id === id)
      if (row) {
        row.due_on = (params[1] ?? null) as string | null
        row.due_at_hours = (params[2] ?? null) as number | null
        row.updated_at = new Date()
      }
      return { rows: [] }
    }

    if (lower.includes('from maintenance_items where id = $1 and pilot_id = $2')) {
      const id = params[0] as string
      const pilotId = params[1] as string
      const row = this.maintenanceItems.find((m) => m.id === id && m.pilot_id === pilotId)
      return { rows: row ? [row] : [] }
    }

    if (lower.includes('from maintenance_items where id = $1')) {
      const id = params[0] as string
      const row = this.maintenanceItems.find((m) => m.id === id)
      return { rows: row ? [row] : [] }
    }

    if (lower.includes('from maintenance_items where pilot_id = $1 and aircraft_id = $2')) {
      const pilotId = params[0] as string
      const aircraftId = params[1] as string
      return {
        rows: this.maintenanceItems
          .filter((m) => m.pilot_id === pilotId && m.aircraft_id === aircraftId)
          .sort((a, b) => a.created_at.getTime() - b.created_at.getTime()),
      }
    }

    if (lower.includes('insert into maintenance_completions')) {
      // Applied immediately (not deferred to commit) because `complete()`
      // reads this row back later in the same transaction — real Postgres
      // sees its own uncommitted writes, and this fake models that for this
      // one multi-statement flow rather than the general rollback case.
      const row = {
        id: `completion-${this.nextId++}`,
        pilot_id: params[0] as string,
        maintenance_item_id: params[1] as string,
        completed_on: params[2] as string,
        completed_at_hours: (params[3] ?? null) as number | null,
        reference: (params[4] ?? null) as string | null,
        created_at: new Date(),
      }
      this.maintenanceCompletions.push(row)
      return { rows: [] }
    }

    if (lower.includes('from maintenance_completions where maintenance_item_id = $1')) {
      const itemId = params[0] as string
      return {
        rows: this.maintenanceCompletions
          .filter((c) => c.maintenance_item_id === itemId)
          .sort((a, b) => b.completed_on.localeCompare(a.completed_on)),
      }
    }

    // --- engine data import (engine-data-import capability) ---
    if (lower.includes('update aircraft set') && lower.includes('engine_limits = $3')) {
      const id = params[0] as string
      const pilotId = params[1] as string
      const row = this.aircraft.find((a) => a.id === id && a.pilot_id === pilotId)
      if (row) {
        row.engine_limits = JSON.parse(params[2] as string) as Record<string, number>
      }
      return { rows: [] }
    }

    if (lower.includes('delete from engine_data_files')) {
      // Applied immediately (not deferred) so a same-transaction insert right
      // after it (in `replace()`) doesn't transiently coexist with the row
      // it's replacing — see the maintenance-completions precedent above.
      const pilotId = params[0] as string
      const flightEntryId = params[1] as string
      const before = this.engineDataFiles.length
      this.engineDataFiles = this.engineDataFiles.filter(
        (f) => !(f.pilot_id === pilotId && f.flight_entry_id === flightEntryId),
      )
      const removed = before !== this.engineDataFiles.length
      return { rows: removed ? [{ id: 'deleted' }] : [] }
    }

    if (lower.includes('insert into engine_data_files')) {
      const now = new Date()
      const row = {
        id: `engine-file-${this.nextId++}`,
        pilot_id: params[0] as string,
        flight_entry_id: params[1] as string,
        original_filename: params[2] as string,
        byte_size: Number(params[3]),
        content_digest: params[4] as string,
        detected_format: params[5] as string,
        imported_at: now,
        channels: JSON.parse(params[6] as string),
        series: JSON.parse(params[7] as string),
        ignored_columns: (params[8] ?? []) as string[],
      }
      // Applied immediately: `replace()` reads this row back later in the
      // same transaction (see the maintenance-completions precedent above).
      this.engineDataFiles.push(row)
      return { rows: [{ id: row.id }] }
    }

    if (lower.includes('from engine_data_files where id = $1')) {
      const id = params[0] as string
      const row = this.engineDataFiles.find((f) => f.id === id)
      return { rows: row ? [row] : [] }
    }

    if (lower.includes('from engine_data_files where pilot_id = $1 and flight_entry_id = $2')) {
      const pilotId = params[0] as string
      const flightEntryId = params[1] as string
      const row = this.engineDataFiles.find(
        (f) => f.pilot_id === pilotId && f.flight_entry_id === flightEntryId,
      )
      return { rows: row ? [row] : [] }
    }

    // --- pilots.active_aircraft_id (design decision 5) ---
    if (
      lower.includes(
        'update pilots set active_aircraft_id = null where id = $1 and active_aircraft_id = $2',
      )
    ) {
      const pilotId = params[0] as string
      const aircraftId = params[1] as string
      const pilot = this.pilots.find((p) => p.id === pilotId)
      const apply = () => {
        if (pilot && pilot.active_aircraft_id === aircraftId) pilot.active_aircraft_id = null
      }
      if (this.inTransaction) this.txChanges.push(apply)
      else apply()
      return { rows: [] }
    }
    if (lower.includes('update pilots set active_aircraft_id = null where id = $1')) {
      const pilotId = params[0] as string
      const pilot = this.pilots.find((p) => p.id === pilotId)
      if (pilot) pilot.active_aircraft_id = null
      return { rows: [] }
    }
    if (lower.includes('update pilots set active_aircraft_id = $2')) {
      const pilotId = params[0] as string
      const aircraftId = params[1] as string
      const pilot = this.pilots.find((p) => p.id === pilotId)
      const exists = this.aircraft.some(
        (a) => a.id === aircraftId && a.pilot_id === pilotId && a.retired_at === null,
      )
      if (pilot && exists) pilot.active_aircraft_id = aircraftId
      return { rows: [] }
    }
    if (lower.includes('join aircraft a on a.id = p.active_aircraft_id')) {
      const pilotId = params[0] as string
      const pilot = this.pilots.find((p) => p.id === pilotId)
      if (!pilot || !pilot.active_aircraft_id) return { rows: [] }
      const row = this.aircraft.find((a) => a.id === pilot.active_aircraft_id)
      return { rows: row ? [row] : [] }
    }

    // --- flight intents (flight-intent capability) ---
    if (lower.includes('insert into flight_intents')) {
      const row = {
        id: `flight-intent-${this.nextId++}`,
        pilot_id: params[0] as string,
        aircraft_id: params[1] as string,
        planned_date: params[2] as string,
        departure_icao: params[3] as string,
        destination_icao: params[4] as string,
        created_at: new Date(),
      }
      this.flightIntents.push(row)
      return { rows: [{ id: row.id }] }
    }

    if (lower.includes('delete from flight_intents')) {
      const id = params[0] as string
      const pilotId = params[1] as string
      const referenced = this.riskAssessments.some((r) => r.flight_intent_id === id)
      if (referenced) return { rows: [] }
      const before = this.flightIntents.length
      this.flightIntents = this.flightIntents.filter(
        (f) => !(f.id === id && f.pilot_id === pilotId),
      )
      const removed = before !== this.flightIntents.length
      return { rows: removed ? [{ id }] : [] }
    }

    if (lower.includes('from flight_intents where id = $1 and pilot_id = $2')) {
      const id = params[0] as string
      const pilotId = params[1] as string
      const row = this.flightIntents.find((f) => f.id === id && f.pilot_id === pilotId)
      return { rows: row ? [row] : [] }
    }

    if (lower.includes('from flight_intents where pilot_id = $1')) {
      const pilotId = params[0] as string
      return {
        rows: this.flightIntents
          .filter((f) => f.pilot_id === pilotId)
          .sort((a, b) => b.created_at.getTime() - a.created_at.getTime()),
      }
    }

    // --- risk assessments (preflight-risk-assessment capability) ---
    if (lower.includes('insert into risk_assessments')) {
      const pilotId = params[0] as string
      const flightIntentId = params[1] as string
      const owns = this.flightIntents.some((f) => f.id === flightIntentId && f.pilot_id === pilotId)
      if (!owns) {
        const err = new Error('simulated FK violation') as Error & { code: string }
        err.code = '23503'
        throw err
      }
      const row = {
        id: `risk-assessment-${this.nextId++}`,
        pilot_id: pilotId,
        flight_intent_id: flightIntentId,
        answers: JSON.parse(params[2] as string),
        domain_scores: JSON.parse(params[3] as string),
        overall_score: Number(params[4]),
        verdict: params[5] as string,
        aircraft_snapshot: JSON.parse(params[6] as string),
        submitted_at: new Date(),
      }
      this.riskAssessments.push(row)
      return { rows: [{ id: row.id }] }
    }

    if (lower.includes('from risk_assessments where id = $1 and pilot_id = $2')) {
      const id = params[0] as string
      const pilotId = params[1] as string
      const row = this.riskAssessments.find((r) => r.id === id && r.pilot_id === pilotId)
      return { rows: row ? [row] : [] }
    }

    if (lower.includes('from risk_assessments where pilot_id = $1 and flight_intent_id = $2')) {
      const pilotId = params[0] as string
      const flightIntentId = params[1] as string
      return {
        rows: this.riskAssessments
          .filter((r) => r.pilot_id === pilotId && r.flight_intent_id === flightIntentId)
          .sort((a, b) => b.submitted_at.getTime() - a.submitted_at.getTime()),
      }
    }

    if (lower.includes('from risk_assessments where pilot_id = $1')) {
      const pilotId = params[0] as string
      return {
        rows: this.riskAssessments
          .filter((r) => r.pilot_id === pilotId)
          .sort((a, b) => b.submitted_at.getTime() - a.submitted_at.getTime()),
      }
    }

    // --- checklist library (aircraft-checklists capability) ---
    if (lower.includes('insert into checklists (')) {
      // Two distinct callers, distinguished by the SQL literal each bakes
      // in for `source`: checklist-repo.create() always makes a pilot-owned
      // checklist (`role`/`source`/`template_version` are literals: NULL,
      // 'pilot', NULL — 5 placeholders); seed.ts seeds a template checklist
      // (`source` is the literal 'template'; role/template_version are real
      // placeholders — 7 placeholders).
      const id = `checklist-${this.nextId++}`
      const now = new Date()
      const isTemplateSeed = lower.includes("'template', $")
      const row = {
        id,
        pilot_id: params[0] as string,
        aircraft_id: params[1] as string,
        name: params[2] as string,
        kind: params[3] as string,
        role: isTemplateSeed ? ((params[4] ?? null) as string | null) : null,
        source: isTemplateSeed ? 'template' : 'pilot',
        template_version: isTemplateSeed ? Number(params[5]) : null,
        position: Number(isTemplateSeed ? params[6] : params[4]),
        created_at: now,
        updated_at: now,
      }
      this.checklists.push(row)
      if (this.inTransaction) {
        this.txRollback.push(() => {
          this.checklists = this.checklists.filter((c) => c.id !== id)
        })
      }
      return { rows: [{ id }] }
    }

    if (lower.includes('from checklists where id = $1 and pilot_id = $2 and aircraft_id = $3')) {
      const id = params[0] as string
      const pilotId = params[1] as string
      const aircraftId = params[2] as string
      const row = this.checklists.find(
        (c) => c.id === id && c.pilot_id === pilotId && c.aircraft_id === aircraftId,
      )
      return { rows: row ? [row] : [] }
    }

    if (
      lower.startsWith('select') &&
      lower.includes('from checklists where id = $1 and pilot_id = $2')
    ) {
      const id = params[0] as string
      const pilotId = params[1] as string
      const row = this.checklists.find((c) => c.id === id && c.pilot_id === pilotId)
      return { rows: row ? [row] : [] }
    }

    if (lower.includes('from checklists where pilot_id = $1 and aircraft_id = $2')) {
      const pilotId = params[0] as string
      const aircraftId = params[1] as string
      const kindRank = (k: string) => (k === 'emergency' ? 1 : 0)
      return {
        rows: this.checklists
          .filter((c) => c.pilot_id === pilotId && c.aircraft_id === aircraftId)
          .sort((a, b) => kindRank(a.kind) - kindRank(b.kind) || a.position - b.position),
      }
    }

    if (
      lower.includes(
        'from checklists where aircraft_id = $1 and kind = $2 and pilot_id = $3 and position = $4',
      )
    ) {
      const aircraftId = params[0] as string
      const kind = params[1] as string
      const pilotId = params[2] as string
      const position = Number(params[3])
      const row = this.checklists.find(
        (c) =>
          c.aircraft_id === aircraftId &&
          c.kind === kind &&
          c.pilot_id === pilotId &&
          c.position === position,
      )
      return { rows: row ? [row] : [] }
    }

    if (lower.includes('from checklists where aircraft_id = $1 and kind = $2')) {
      const aircraftId = params[0] as string
      const kind = params[1] as string
      const max = this.checklists
        .filter((c) => c.aircraft_id === aircraftId && c.kind === kind)
        .reduce((m, c) => Math.max(m, c.position + 1), 0)
      return { rows: [{ next: String(max) }] }
    }

    if (
      lower.startsWith('select') &&
      lower.includes(
        "from checklists where aircraft_id = $1 and pilot_id = $2 and role = 'preflight'",
      )
    ) {
      const aircraftId = params[0] as string
      const pilotId = params[1] as string
      const row = this.checklists.find(
        (c) => c.aircraft_id === aircraftId && c.pilot_id === pilotId && c.role === 'preflight',
      )
      return { rows: row ? [row] : [] }
    }

    if (lower.includes('update checklists set position = $1 where id = $2')) {
      const position = Number(params[0])
      const id = params[1] as string
      const row = this.checklists.find((c) => c.id === id)
      if (row) row.position = position
      return { rows: [] }
    }

    if (
      lower.includes(
        "update checklists set name = $3, source = 'pilot' where id = $1 and pilot_id = $2",
      )
    ) {
      const id = params[0] as string
      const pilotId = params[1] as string
      const name = params[2] as string
      const row = this.checklists.find((c) => c.id === id && c.pilot_id === pilotId)
      const rows: Array<{ id: string }> = []
      if (row) {
        row.name = name
        row.source = 'pilot'
        rows.push({ id: row.id })
      }
      return { rows }
    }

    if (lower.includes("update checklists set source = 'pilot' where id = $1 and pilot_id = $2")) {
      const id = params[0] as string
      const pilotId = params[1] as string
      const row = this.checklists.find((c) => c.id === id && c.pilot_id === pilotId)
      if (row) row.source = 'pilot'
      return { rows: [] }
    }

    if (
      lower.includes(
        "update checklists set role = null where aircraft_id = $1 and pilot_id = $2 and role = 'preflight'",
      )
    ) {
      const aircraftId = params[0] as string
      const pilotId = params[1] as string
      for (const c of this.checklists) {
        if (c.aircraft_id === aircraftId && c.pilot_id === pilotId && c.role === 'preflight') {
          c.role = null
        }
      }
      return { rows: [] }
    }

    if (
      lower.includes("update checklists set role = 'preflight' where id = $1 and pilot_id = $2")
    ) {
      const id = params[0] as string
      const pilotId = params[1] as string
      const row = this.checklists.find((c) => c.id === id && c.pilot_id === pilotId)
      if (row) row.role = 'preflight'
      return { rows: [] }
    }

    if (lower.includes('delete from checklists where id = $1 and pilot_id = $2')) {
      const id = params[0] as string
      const pilotId = params[1] as string
      const before = this.checklists.length
      this.checklists = this.checklists.filter((c) => !(c.id === id && c.pilot_id === pilotId))
      const removed = before !== this.checklists.length
      if (removed) {
        this.checklistItems = this.checklistItems.filter((i) => i.checklist_id !== id)
        for (const run of this.checklistRuns) {
          if (run.checklist_id === id) run.checklist_id = null
        }
      }
      return { rows: removed ? [{ id }] : [] }
    }

    // --- checklist items ---
    if (lower.includes('insert into checklist_items (')) {
      const id = `checklist-item-${this.nextId++}`
      const now = new Date()
      const row = {
        id,
        pilot_id: params[0] as string,
        checklist_id: params[1] as string,
        text: params[2] as string,
        response: null,
        position: Number(params[3]),
        created_at: now,
        updated_at: now,
      }
      this.checklistItems.push(row)
      if (this.inTransaction) {
        this.txRollback.push(() => {
          this.checklistItems = this.checklistItems.filter((i) => i.id !== id)
        })
      }
      return { rows: [{ id }] }
    }

    if (
      lower.startsWith('select') &&
      lower.includes('from checklist_items where id = $1 and checklist_id = $2 and pilot_id = $3')
    ) {
      const id = params[0] as string
      const checklistId = params[1] as string
      const pilotId = params[2] as string
      const row = this.checklistItems.find(
        (i) => i.id === id && i.checklist_id === checklistId && i.pilot_id === pilotId,
      )
      return { rows: row ? [row] : [] }
    }

    if (
      lower.includes(
        'from checklist_items where checklist_id = $1 and pilot_id = $2 and position = $3',
      )
    ) {
      const checklistId = params[0] as string
      const pilotId = params[1] as string
      const position = Number(params[2])
      const row = this.checklistItems.find(
        (i) => i.checklist_id === checklistId && i.pilot_id === pilotId && i.position === position,
      )
      return { rows: row ? [row] : [] }
    }

    if (lower.includes('from checklist_items where checklist_id = $1 and pilot_id = $2')) {
      const checklistId = params[0] as string
      const pilotId = params[1] as string
      return {
        rows: this.checklistItems
          .filter((i) => i.checklist_id === checklistId && i.pilot_id === pilotId)
          .sort((a, b) => a.position - b.position),
      }
    }

    if (lower.includes('from checklist_items where id = $1 limit 1')) {
      const id = params[0] as string
      const row = this.checklistItems.find((i) => i.id === id)
      return { rows: row ? [row] : [] }
    }

    if (lower.includes('from checklist_items where checklist_id = $1')) {
      const checklistId = params[0] as string
      const max = this.checklistItems
        .filter((i) => i.checklist_id === checklistId)
        .reduce((m, i) => Math.max(m, i.position + 1), 0)
      return { rows: [{ next: String(max) }] }
    }

    if (
      lower.includes(
        'update checklist_items set text = $4 where id = $3 and checklist_id = $2 and pilot_id = $1',
      )
    ) {
      const pilotId = params[0] as string
      const checklistId = params[1] as string
      const id = params[2] as string
      const text = params[3] as string
      const row = this.checklistItems.find(
        (i) => i.id === id && i.checklist_id === checklistId && i.pilot_id === pilotId,
      )
      const rows: Array<{ id: string }> = []
      if (row) {
        row.text = text
        rows.push({ id: row.id })
      }
      return { rows }
    }

    if (lower.includes('update checklist_items set position = $1 where id = $2')) {
      const position = Number(params[0])
      const id = params[1] as string
      const row = this.checklistItems.find((i) => i.id === id)
      if (row) row.position = position
      return { rows: [] }
    }

    if (
      lower.includes(
        'delete from checklist_items where id = $1 and checklist_id = $2 and pilot_id = $3',
      )
    ) {
      const id = params[0] as string
      const checklistId = params[1] as string
      const pilotId = params[2] as string
      const before = this.checklistItems.length
      this.checklistItems = this.checklistItems.filter(
        (i) => !(i.id === id && i.checklist_id === checklistId && i.pilot_id === pilotId),
      )
      const removed = before !== this.checklistItems.length
      return { rows: removed ? [{ id }] : [] }
    }

    // --- checklist runs (checklist-runs capability) ---
    if (lower.includes('insert into checklist_runs (')) {
      const row = {
        id: `checklist-run-${this.nextId++}`,
        pilot_id: params[0] as string,
        checklist_id: params[1] as string,
        checklist_name: params[2] as string,
        flight_intent_id: params[3] as string,
        aircraft_id: params[4] as string,
        started_at: new Date(),
        completed_at: null,
      }
      this.checklistRuns.push(row)
      return { rows: [{ id: row.id }] }
    }

    if (
      lower.includes(
        'from checklist_runs where pilot_id = $1 and flight_intent_id = $2 and checklist_id = $3 and completed_at is null',
      )
    ) {
      const pilotId = params[0] as string
      const flightIntentId = params[1] as string
      const checklistId = params[2] as string
      const row = this.checklistRuns.find(
        (r) =>
          r.pilot_id === pilotId &&
          r.flight_intent_id === flightIntentId &&
          r.checklist_id === checklistId &&
          r.completed_at === null,
      )
      return { rows: row ? [row] : [] }
    }

    if (
      lower.includes(
        'from checklist_runs where pilot_id = $1 and flight_intent_id = $2 and checklist_id = $3 order by started_at desc',
      )
    ) {
      const pilotId = params[0] as string
      const flightIntentId = params[1] as string
      const checklistId = params[2] as string
      const rows = this.checklistRuns
        .filter(
          (r) =>
            r.pilot_id === pilotId &&
            r.flight_intent_id === flightIntentId &&
            r.checklist_id === checklistId,
        )
        .sort((a, b) => b.started_at.getTime() - a.started_at.getTime())
      return { rows: rows.length > 0 ? [rows[0] as (typeof rows)[number]] : [] }
    }

    if (lower.includes('from checklist_runs where id = $1 and pilot_id = $2')) {
      const id = params[0] as string
      const pilotId = params[1] as string
      const row = this.checklistRuns.find((r) => r.id === id && r.pilot_id === pilotId)
      return { rows: row ? [row] : [] }
    }

    if (
      lower.includes(
        'from checklist_runs where pilot_id = $1 and aircraft_id = $2 and completed_at is not null',
      )
    ) {
      const pilotId = params[0] as string
      const aircraftId = params[1] as string
      return {
        rows: this.checklistRuns
          .filter(
            (r) =>
              r.pilot_id === pilotId && r.aircraft_id === aircraftId && r.completed_at !== null,
          )
          .sort((a, b) => (b.completed_at as Date).getTime() - (a.completed_at as Date).getTime()),
      }
    }

    if (lower.includes('update checklist_runs set completed_at = $1 where id = $2')) {
      const completedAt = (params[0] ?? null) as Date | null
      const id = params[1] as string
      const row = this.checklistRuns.find((r) => r.id === id)
      if (row) row.completed_at = completedAt
      return { rows: [] }
    }

    // --- checklist run items ---
    if (lower.includes('insert into checklist_run_items (')) {
      const row = {
        id: `checklist-run-item-${this.nextId++}`,
        pilot_id: params[0] as string,
        run_id: params[1] as string,
        checklist_item_id: (params[2] ?? null) as string | null,
        text: params[3] as string,
        position: Number(params[4]),
        checked_at: null,
      }
      this.checklistRunItems.push(row)
      return { rows: [{ id: row.id }] }
    }

    if (
      lower.includes('from checklist_run_items where id = $1 and run_id = $2 and pilot_id = $3')
    ) {
      const id = params[0] as string
      const runId = params[1] as string
      const pilotId = params[2] as string
      const row = this.checklistRunItems.find(
        (i) => i.id === id && i.run_id === runId && i.pilot_id === pilotId,
      )
      return { rows: row ? [row] : [] }
    }

    if (lower.includes('from checklist_run_items where run_id = $1 and pilot_id = $2')) {
      const runId = params[0] as string
      const pilotId = params[1] as string
      return {
        rows: this.checklistRunItems
          .filter((i) => i.run_id === runId && i.pilot_id === pilotId)
          .sort((a, b) => a.position - b.position),
      }
    }

    if (lower.includes('update checklist_run_items set checked_at = $1 where id = $2')) {
      const checkedAt = (params[0] ?? null) as Date | null
      const id = params[1] as string
      const row = this.checklistRunItems.find((i) => i.id === id)
      if (row) row.checked_at = checkedAt
      return { rows: [] }
    }

    if (lower.includes('update checklist_run_items set checked_at = null where run_id = $1')) {
      const runId = params[0] as string
      for (const i of this.checklistRunItems) {
        if (i.run_id === runId) i.checked_at = null
      }
      return { rows: [] }
    }

    if (lower.includes('count(checked_at) as checked from checklist_run_items where run_id = $1')) {
      const runId = params[0] as string
      const items = this.checklistRunItems.filter((i) => i.run_id === runId)
      const checked = items.filter((i) => i.checked_at !== null).length
      return { rows: [{ total: String(items.length), checked: String(checked) }] }
    }

    const countMatch = /select count\(\*\)(?: as [a-z_]+)? from ([a-z_]+)/.exec(lower)
    if (countMatch) {
      const table = countMatch[1]
      if (table === 'pilots') return { rows: [{ count: String(this.pilots.length) }] }
      if (table === 'documents') return { rows: [{ count: String(this.documents.length) }] }
      if (table === 'document_chunks') return { rows: [{ count: String(this.chunks.length) }] }
    }

    return { rows: [] }
  }
}
