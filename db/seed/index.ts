import { pathToFileURL } from 'node:url'

import { ConfigError, loadConfig } from '../../src/server/config.js'
import { createPool } from '../../src/platform/db/pool.js'
import { hashPassword } from '../../src/platform/identity/passwords.js'
import { mockEmbedding, seedDevDatabase, seedFleetSample, seedRiskSample } from './seed.js'

/**
 * CLI: seed a development database with the development pilot and sample
 * documents for the retrieval seam. Aborts in production. Usage:
 *   DATABASE_URL=... EMBEDDING_DIMENSIONS=768 npm run db:seed
 *
 * Known development credentials (development only):
 *   email:    piloto@ga-core.local
 *   password: piloto-dev-1234
 */
export async function main(): Promise<void> {
  let config
  try {
    config = loadConfig()
  } catch (error) {
    if (error instanceof ConfigError) console.error(error.message)
    else console.error(error)
    process.exitCode = 1
    return
  }

  const pool = createPool(config.DATABASE_URL)
  try {
    const passwordHash = await hashPassword('piloto-dev-1234')
    const result = await seedDevDatabase(pool, {
      environment: config.NODE_ENV,
      pilot: {
        email: 'piloto@ga-core.local',
        displayName: 'Piloto de Desarrollo',
        locale: 'es',
        passwordHash,
      },
      documents: [
        {
          document: {
            title: 'Briefing de referencia: climatología local',
            category: 'reference',
            sourceReference: 'dev/clima-local-es',
            locale: 'es',
          },
          chunks: [
            {
              position: 0,
              content:
                'Guía de la climatología local para el vuelo VFR en la meseta: inversiones térmicas matinales, vientos de poniente por la tarde y cizalladura en aproximación final cuando el viento rola a 220 grados.',
              embedding: mockEmbedding('clima-local-0', config.EMBEDDING_DIMENSIONS),
            },
            {
              position: 1,
              content:
                'Reglas locales de presión QNH: extracto de la carta de corrección para aeródromos por debajo de 1 000 m MSL.',
              embedding: mockEmbedding('clima-local-1', config.EMBEDDING_DIMENSIONS),
            },
          ],
        },
        {
          document: {
            title: 'Referencia tecnica: lecturas METAR',
            category: 'reference',
            sourceReference: 'dev/metar-es',
            locale: 'es',
          },
          chunks: [
            {
              position: 0,
              content:
                'Lectura de un METAR: la hora se indica en formato DDHHMMZ, la visibilidad en metros para valores inferiores a 5 km, y los grupos de viento en grados true y nudos.',
              embedding: mockEmbedding('metar-0', config.EMBEDDING_DIMENSIONS),
            },
            {
              position: 1,
              content:
                'Códigos de intensidad y proximidad: en la vecindad y sin significado operativo para la toma de decisiones en vuelo.',
              embedding: mockEmbedding('metar-1', config.EMBEDDING_DIMENSIONS),
            },
          ],
        },
      ],
    })

    const fleet = await seedFleetSample(pool, result.pilotId, config.NODE_ENV)
    const risk = await seedRiskSample(pool, result.pilotId, fleet.aircraftId, config.NODE_ENV)

    console.log(
      `seed complete: pilots=${result.counts.pilots} documents=${result.counts.documents} chunks=${result.counts.chunks} ` +
        `fleet_aircraft=1 fleet_flights=${fleet.flightCount} fleet_documents=${fleet.documentCount} fleet_maintenance_items=${fleet.maintenanceItemCount} ` +
        `risk_flight_intents=1 risk_assessments=${risk.assessmentCount}`,
    )
  } finally {
    await pool.end()
  }
}

const isMain = process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  void main()
}
