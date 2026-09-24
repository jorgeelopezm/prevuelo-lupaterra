import type { FlightRepo } from '../fleet/flight-repo.js'
import type { MaintenanceRepo } from '../fleet/maintenance-repo.js'
import type { EngineDataRepo } from '../fleet/engine-data-repo.js'
import type { WbRepo } from '../fleet/wb-repo.js'
import { deriveMaintenanceStatus } from '../fleet/maintenance-status.js'
import type { AircraftSnapshot } from './types.js'

/** Hours-remaining threshold below which "hours to next maintenance" is
 * itself treated as a risk factor (see `scoreAircraftDomain`). Sourced here
 * rather than app config since it is a scoring-model constant, not a
 * deployment setting (design.md: "Thresholds and item weights live in a
 * versioned config object in code"). */
const MAINTENANCE_DUE_SOON_HOURS = 10

export interface AircraftSnapshotRepos {
  flightRepo: Pick<FlightRepo, 'lastForAircraft' | 'aircraftTotals'>
  maintenanceRepo: Pick<MaintenanceRepo, 'list'>
  engineDataRepo: Pick<EngineDataRepo, 'getForFlight' | 'getAircraftLimits'>
  wbRepo: Pick<WbRepo, 'get'>
}

/**
 * Read the Aircraft domain's auto-scored values from the existing
 * `aircraft-fleet` platform layer (preflight-risk-assessment spec: "The
 * Aircraft domain is enriched with auto-scored aircraft data"). Every field
 * is `null` when the aircraft has no data to derive it from — the caller
 * never fabricates a favorable value (spec: "No fleet data available yet").
 */
export async function readAircraftSnapshot(
  pilotId: string,
  aircraftId: string,
  repos: AircraftSnapshotRepos,
): Promise<AircraftSnapshot> {
  const lastFlight = await repos.flightRepo.lastForAircraft(pilotId, aircraftId)

  let engineExceedance: boolean | null = null
  let fuelStatus: 'ok' | 'low' | null = null

  if (lastFlight) {
    const [engineFile, limits, wbProfile] = await Promise.all([
      repos.engineDataRepo.getForFlight(pilotId, lastFlight.id),
      repos.engineDataRepo.getAircraftLimits(pilotId, aircraftId),
      repos.wbRepo.get(pilotId, aircraftId),
    ])

    if (engineFile && limits) {
      engineExceedance = engineFile.channels.some((channel) => {
        const baseKey = channel.key.replace(/\d+$/, '')
        const limit = limits[channel.key] ?? limits[baseKey]
        if (limit === undefined) return false
        const values = engineFile.series.values[channel.key] ?? []
        return values.some((v) => v > limit)
      })
    } else if (engineFile) {
      // Data exists but no limits entered: nothing to compare against.
      engineExceedance = null
    }

    // Fuel status is a best-effort proxy — the app has no live
    // current-fuel-onboard reading, so this compares the last flight's fuel
    // burn against the aircraft's usable fuel capacity when both are known
    // (see AircraftSnapshot.fuelStatus's doc comment).
    if (wbProfile.usableFuelQty !== null && lastFlight.fuelBurn !== null) {
      fuelStatus = lastFlight.fuelBurn >= wbProfile.usableFuelQty * 0.9 ? 'low' : 'ok'
    }
  }

  const [totals, maintenanceItems] = await Promise.all([
    repos.flightRepo.aircraftTotals(pilotId, aircraftId),
    repos.maintenanceRepo.list(pilotId, aircraftId),
  ])

  let hoursToNextMaintenance: number | null = null
  const now = new Date()
  for (const item of maintenanceItems) {
    if (item.dueAtHours === null) continue
    const basisHours = item.hoursBasis === 'tach' ? totals.tachHours : totals.airframeHours
    const derived = deriveMaintenanceStatus(item, now, totals.computable ? basisHours : null, 0, 0)
    if (!derived.hoursComputable || derived.hoursRemaining === null) continue
    if (hoursToNextMaintenance === null || derived.hoursRemaining < hoursToNextMaintenance) {
      hoursToNextMaintenance = derived.hoursRemaining
    }
  }

  return { engineExceedance, fuelStatus, hoursToNextMaintenance }
}

export { MAINTENANCE_DUE_SOON_HOURS }
