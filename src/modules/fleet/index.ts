import type { FastifyReply, FastifyRequest } from 'fastify'
import multipart from '@fastify/multipart'

import type { FeatureModule, ModuleContext } from '../types.js'
import { createTranslator } from '../../platform/i18n/catalog.js'
import { SUPPORTED_LOCALES, type SupportedLocale } from '../../platform/i18n/locale.js'
import { destinationPath } from '../../platform/i18n/segments.js'
import { createRequireAuthHook, CSRF_NONCE_COOKIE } from '../../server/auth/auth-plugin.js'
import { verifyCsrfToken } from '../../platform/identity/csrf.js'
import { createAircraftRepo } from '../../platform/fleet/aircraft-repo.js'
import { createDocumentsRepo } from '../../platform/fleet/documents-repo.js'
import { createWbRepo } from '../../platform/fleet/wb-repo.js'
import { createFlightRepo } from '../../platform/fleet/flight-repo.js'
import { createMaintenanceRepo } from '../../platform/fleet/maintenance-repo.js'
import { createEngineDataRepo } from '../../platform/fleet/engine-data-repo.js'
import { documentStatus, daysUntil } from '../../platform/fleet/document-status.js'
import { deriveMaintenanceStatus } from '../../platform/fleet/maintenance-status.js'
import { seedChecklistsForAircraft } from '../../platform/checklists/seed.js'
import { importEngineData } from './engine-data/importer.js'
import type {
  AircraftRecord,
  AircraftTotals,
  EngineDataFileRecord,
  EngineLimits,
  FlightEntryRecord,
  MaintenanceItemRecord,
  PilotTotals,
  WbProfile,
} from '../../platform/fleet/types.js'
import {
  validateAircraftForm,
  validateDocumentForm,
  validateFlightEntryForm,
  validateMaintenanceItemForm,
  validateCompleteMaintenanceForm,
  parseWbForm,
  WB_FORM_ROWS,
  type FleetFormErrors,
} from './forms.js'
import { fleetPath } from './paths.js'
import { formatMinutesAsDecimalHours } from './duration.js'

/** Common engine-monitor limit channels offered on the limits form (the
 * screen never infers a limit — every value here is opt-in, per the
 * engine-data-import spec: "No inferred limits"). */
const ENGINE_LIMIT_CHANNELS = ['cht', 'egt', 'oil_temp', 'oil_pressure'] as const

/** Each fleet route is registered per-locale at a literal (already-resolved)
 * path — not a `/:locale/...` template — so the redirect target is built from
 * the closed-over locale rather than a route param. */
function makeSignInUrlBuilder(locale: SupportedLocale): (req: FastifyRequest) => string {
  return (req) => `/${locale}/auth/sign-in?next=${encodeURIComponent(req.url)}`
}

/** Presentation shape for one aircraft row/detail — strings only, so the
 * template never has to reason about null vs. formatting. */
function toView(aircraft: AircraftRecord, locale: SupportedLocale) {
  return {
    id: aircraft.id,
    registration: aircraft.registration,
    icaoType: aircraft.icaoType,
    manufacturer: aircraft.manufacturer,
    model: aircraft.model,
    serialNumber: aircraft.serialNumber,
    classCategory: aircraft.classCategory,
    engine: aircraft.engine,
    propeller: aircraft.propeller,
    yearOfManufacture: aircraft.yearOfManufacture,
    homeBase: aircraft.homeBase,
    nickname: aircraft.nickname,
    openingAirframeHours: aircraft.openingAirframeHours,
    openingEngineHours: aircraft.openingEngineHours,
    openingTachHours: aircraft.openingTachHours,
    openingLandings: aircraft.openingLandings,
    retired: aircraft.retiredAt !== null,
    editHref: fleetPath('aircraft', locale, [aircraft.id, 'edit']),
    retireHref: fleetPath('aircraft', locale, [aircraft.id, 'delete']),
    activateHref: fleetPath('aircraft', locale, [aircraft.id, 'activate']),
  }
}

/** Presentation shape for one document row: the derived status is computed
 * here, at render time, from `expiresOn` — never stored (aircraft-fleet
 * spec: "Document validity status is derived, never entered"). */
function documentView(
  doc: {
    id: string
    kind: string
    reference: string | null
    issuedOn: string | null
    expiresOn: string | null
  },
  warningDays: number,
) {
  const now = new Date()
  return {
    id: doc.id,
    kind: doc.kind,
    reference: doc.reference,
    issuedOn: doc.issuedOn,
    expiresOn: doc.expiresOn,
    status: documentStatus(doc.expiresOn, now, warningDays),
    daysRemaining: daysUntil(doc.expiresOn, now),
  }
}

/** Presentation shape for the weight & balance profile. `hasProfile` is
 * false only when no empty weight has been entered — the screen then shows
 * the "no profile entered" state and no numeric value at all. */
function wbView(profile: WbProfile) {
  return {
    hasProfile: profile.emptyWeight !== null,
    emptyWeight: profile.emptyWeight,
    emptyWeightArm: profile.emptyWeightArm,
    mtow: profile.mtow,
    mlw: profile.mlw,
    mzfw: profile.mzfw,
    usableFuelQty: profile.usableFuelQty,
    usableFuelArm: profile.usableFuelArm,
    massUnit: profile.massUnit,
    lengthUnit: profile.lengthUnit,
    loadStations: profile.loadStations,
    envelopePoints: profile.envelopePoints,
  }
}

/** Presentation shape for one logbook entry row. */
function entryView(entry: FlightEntryRecord, locale: SupportedLocale) {
  return {
    id: entry.id,
    kind: entry.kind,
    flightDate: entry.flightDate,
    departureAerodrome: entry.departureAerodrome,
    arrivalAerodrome: entry.arrivalAerodrome,
    pilotFunction: entry.pilotFunction,
    totalHours: formatMinutesAsDecimalHours(entry.totalMinutes),
    deviceType: entry.deviceType,
    editHref: fleetPath('logbook', locale, [entry.id, 'edit']),
    deleteHref: fleetPath('logbook', locale, [entry.id, 'delete']),
  }
}

/** Presentation shape for the aircraft totals panel — pre-formatted to a
 * fixed one-decimal string so the template never has to reason about
 * trailing-zero formatting. */
function aircraftTotalsView(totals: AircraftTotals) {
  return {
    computable: totals.computable,
    airframeHours: totals.airframeHours !== null ? totals.airframeHours.toFixed(1) : null,
    tachHours: totals.tachHours !== null ? totals.tachHours.toFixed(1) : null,
    landings: totals.landings,
  }
}

/** Presentation shape for the pilot totals / recent-experience panel. Every
 * figure is a count derived at render time — never a legal-currency verdict
 * (flight-logbook spec: "Recency is a count, not a currency verdict"). */
function totalsView(totals: PilotTotals) {
  return {
    hasEntries: totals.hasEntries,
    totalHours: formatMinutesAsDecimalHours(totals.totalMinutes),
    picHours: formatMinutesAsDecimalHours(totals.picMinutes),
    spicHours: formatMinutesAsDecimalHours(totals.spicMinutes),
    sicHours: formatMinutesAsDecimalHours(totals.sicMinutes),
    dualHours: formatMinutesAsDecimalHours(totals.dualMinutes),
    instructorHours: formatMinutesAsDecimalHours(totals.instructorMinutes),
    nightHours: formatMinutesAsDecimalHours(totals.nightMinutes),
    ifrHours: formatMinutesAsDecimalHours(totals.ifrMinutes),
    crossCountryHours: formatMinutesAsDecimalHours(totals.crossCountryMinutes),
    instrumentHours: formatMinutesAsDecimalHours(totals.instrumentMinutes),
    totalLandings: totals.totalLandings,
    fstdHours: formatMinutesAsDecimalHours(totals.fstdMinutes),
    recentLandings90d: totals.recentLandings90d,
    recentNightLandings90d: totals.recentNightLandings90d,
  }
}

/** Presentation shape for one maintenance item row, with its status derived
 * at render time (maintenance-tracking spec: "Remaining time and hours are
 * derived"). */
function maintenanceItemView(
  item: MaintenanceItemRecord,
  currentHours: { airframe: number | null; tach: number | null },
  now: Date,
  warningDays: number,
  warningHours: number,
  locale: SupportedLocale,
) {
  const basisHours = item.hoursBasis === 'tach' ? currentHours.tach : currentHours.airframe
  const derived = deriveMaintenanceStatus(item, now, basisHours, warningDays, warningHours)
  return {
    id: item.id,
    description: item.description,
    dueOn: item.dueOn,
    dueAtHours: item.dueAtHours,
    hoursBasis: item.hoursBasis,
    reference: item.reference,
    status: derived.status,
    daysRemaining: derived.daysRemaining,
    hoursRemaining: derived.hoursRemaining !== null ? derived.hoursRemaining.toFixed(1) : null,
    hoursComputable: derived.hoursComputable,
    completeHref: fleetPath('maintenance', locale, [item.id, 'complete']),
  }
}

/** Presentation shape for the engine trend panel: per-channel min/max/last
 * over the whole imported series, plus provenance. Renders only when a real
 * file backs it — the route never calls this with a fabricated series
 * (engine-data-import spec: "No engine value is displayed without an
 * imported file behind it"). */
function engineDataView(file: EngineDataFileRecord, limits: EngineLimits | null) {
  const channels = file.channels.map((channel) => {
    const values = file.series.values[channel.key] ?? []
    // A per-cylinder channel (cht1, egt2, …) matches a limit entered against
    // its base channel type (cht, egt) — one CHT limit applies to every
    // cylinder, matching how a pilot would enter it (spec: "Limits are shown
    // only when the pilot has entered them").
    const baseKey = channel.key.replace(/\d+$/, '')
    const limit = limits?.[channel.key] ?? limits?.[baseKey] ?? null
    return {
      key: channel.key,
      label: channel.label,
      unit: channel.unit,
      last: values.length ? values[values.length - 1] : null,
      min: values.length ? Math.min(...values) : null,
      max: values.length ? Math.max(...values) : null,
      limit,
    }
  })
  return {
    originalFilename: file.originalFilename,
    detectedFormat: file.detectedFormat,
    importedAt: file.importedAt,
    ignoredColumns: file.ignoredColumns,
    channels,
  }
}

/** Aircraft & Logbook module: the pilot's own aircraft, logbook, maintenance,
 * and imported engine data (aircraft-fleet / flight-logbook /
 * maintenance-tracking / engine-data-import capabilities). */
export const fleetModule: FeatureModule = {
  id: 'fleet',
  labelKey: 'nav.aircraft',
  icon: 'plane',
  order: 5,
  register: (app, context) => {
    // The checklist library is seeded inside the same transaction as the
    // aircraft insert (aircraft-checklists: "Seeding on aircraft creation").
    // Injected here rather than imported by `platform/fleet` directly, so
    // that platform module stays independent of `platform/checklists`
    // (design.md decision 3).
    const repo = createAircraftRepo(context.pool, {
      onAircraftCreated: (tx, pilotId, aircraftId, locale) =>
        seedChecklistsForAircraft(tx, { pilotId, aircraftId, locale }),
    })
    const documentsRepo = createDocumentsRepo(context.pool)
    const wbRepo = createWbRepo(context.pool)
    const flightRepo = createFlightRepo(context.pool)
    const maintenanceRepo = createMaintenanceRepo(context.pool)
    const engineDataRepo = createEngineDataRepo(context.pool)

    // Registered here (rather than app.ts) because @fastify/multipart is
    // fastify-plugin-wrapped: its decorations (`req.parts()`, `req.file()`)
    // attach to the root instance regardless of where it's registered, so
    // this keeps the one route that needs it self-contained. CSRF for the
    // one upload route is verified manually in the handler (see
    // auth-plugin.ts's preValidation hook, which skips multipart requests).
    void app.register(multipart, {
      limits: { fileSize: context.config.ENGINE_DATA_MAX_BYTES, files: 1 },
    })

    for (const locale of SUPPORTED_LOCALES) {
      const requireAuth = { onRequest: createRequireAuthHook(makeSignInUrlBuilder(locale)) }

      // Main screen: the pilot's aircraft list plus the selected aircraft's
      // detail (defaults to the active aircraft, then the first aircraft).
      app.get(destinationPath('fleet', locale), requireAuth, async (req, reply) => {
        const t = createTranslator({ locale })
        const pilotId = (req.pilot as NonNullable<typeof req.pilot>).id
        const [aircraftList, active] = await Promise.all([
          repo.list(pilotId),
          repo.getActiveAircraft(pilotId),
        ])

        const requestedId = (req.query as { aircraft?: string }).aircraft
        const selected =
          aircraftList.find((a) => a.id === requestedId) ??
          aircraftList.find((a) => a.id === active?.id) ??
          aircraftList.find((a) => a.retiredAt === null) ??
          null

        const page = Number((req.query as { page?: string }).page ?? '1') || 1
        const pageSize = 10

        const [
          documents,
          wbProfile,
          aircraftTotals,
          entries,
          entryCount,
          pilotTotals,
          maintenanceItems,
          lastFlight,
          engineLimits,
        ] = selected
          ? await Promise.all([
              documentsRepo.list(pilotId, selected.id),
              wbRepo.get(pilotId, selected.id),
              flightRepo.aircraftTotals(pilotId, selected.id),
              flightRepo.list(pilotId, {
                aircraftId: selected.id,
                limit: pageSize,
                offset: (page - 1) * pageSize,
              }),
              flightRepo.count(pilotId, { aircraftId: selected.id }),
              flightRepo.pilotTotals(pilotId),
              maintenanceRepo.list(pilotId, selected.id),
              flightRepo.lastForAircraft(pilotId, selected.id),
              engineDataRepo.getAircraftLimits(pilotId, selected.id),
            ])
          : [[], null, null, [], 0, await flightRepo.pilotTotals(pilotId), [], null, null]

        const engineDataFile = lastFlight
          ? await engineDataRepo.getForFlight(pilotId, lastFlight.id)
          : null

        const html = context.views.render(req, {
          fragment: 'pages/aircraft.njk',
          locals: {
            title: t.translate('nav.aircraft'),
            activeNav: 'fleet',
            icon: 'plane',
            aircraftList: aircraftList.map((a) => toView(a, locale)),
            selected: selected ? toView(selected, locale) : null,
            activeAircraftId: active?.id ?? null,
            newHref: fleetPath('aircraft', locale, ['new']),
            basePath: destinationPath('fleet', locale),
            documents: documents.map((d) => documentView(d, context.config.DOCUMENT_WARNING_DAYS)),
            addDocumentHref: selected
              ? fleetPath('aircraft', locale, [selected.id, 'documents'])
              : null,
            documentError: (req.query as { documentError?: string }).documentError
              ? t.translate((req.query as { documentError?: string }).documentError as string)
              : null,
            wbProfile: wbProfile ? wbView(wbProfile) : null,
            wbHref: selected ? fleetPath('aircraft', locale, [selected.id, 'wb']) : null,
            aircraftTotals: aircraftTotals ? aircraftTotalsView(aircraftTotals) : null,
            entries: entries.map((e) => entryView(e, locale)),
            entryCount,
            page,
            pageCount: Math.max(1, Math.ceil(entryCount / pageSize)),
            pageHrefBase: selected
              ? `${destinationPath('fleet', locale)}?aircraft=${selected.id}&page=`
              : null,
            newFlightHref: selected
              ? fleetPath('logbook', locale, ['new']) + `?aircraft=${selected.id}`
              : null,
            newFstdHref: fleetPath('logbook', locale, ['new']) + '?fstd=1',
            pilotTotals: totalsView(pilotTotals),
            maintenanceItems: maintenanceItems.map((m) =>
              maintenanceItemView(
                m,
                {
                  airframe: aircraftTotals?.computable ? aircraftTotals.airframeHours : null,
                  tach: aircraftTotals?.computable ? aircraftTotals.tachHours : null,
                },
                new Date(),
                context.config.MAINTENANCE_WARNING_DAYS,
                context.config.MAINTENANCE_WARNING_HOURS,
                locale,
              ),
            ),
            addMaintenanceHref: selected
              ? fleetPath('maintenance', locale, [selected.id, 'new'])
              : null,
            hasLastFlight: lastFlight !== null,
            engineData: engineDataFile ? engineDataView(engineDataFile, engineLimits) : null,
            engineUploadHref: lastFlight
              ? fleetPath('engine-data', locale, [lastFlight.id, 'upload'])
              : null,
            engineDeleteHref: lastFlight
              ? fleetPath('engine-data', locale, [lastFlight.id, 'delete'])
              : null,
            engineLimitsHref: selected
              ? fleetPath('aircraft', locale, [selected.id, 'engine-data'])
              : null,
            engineDataError: (req.query as { engineDataError?: string }).engineDataError
              ? t.translate((req.query as { engineDataError?: string }).engineDataError as string)
              : null,
          },
        })
        return reply.type('text/html; charset=utf-8').send(html)
      })

      // New aircraft form.
      app.get(fleetPath('aircraft', locale, ['new']), requireAuth, async (req, reply) => {
        const t = createTranslator({ locale })
        const html = context.views.render(req, {
          fragment: 'pages/aircraft-form.njk',
          locals: {
            title: t.translate('fleet.new_aircraft_title'),
            activeNav: 'fleet',
            icon: 'plane',
            action: fleetPath('aircraft', locale, ['new']),
            values: {},
            errors: {},
            isEdit: false,
          },
        })
        return reply.type('text/html; charset=utf-8').send(html)
      })

      app.post(fleetPath('aircraft', locale, ['new']), requireAuth, async (req, reply) => {
        const t = createTranslator({ locale })
        const pilotId = (req.pilot as NonNullable<typeof req.pilot>).id
        const body = (req.body ?? {}) as Record<string, unknown>
        const result = validateAircraftForm(body)

        if (!result.ok) {
          return renderFormError(t, result.errors, body, locale, null, context, req, reply)
        }

        const created = await repo.create(pilotId, result.data, locale)
        if (!created.ok) {
          const errors: FleetFormErrors = { registration: 'fleet.error.registration_duplicate' }
          return renderFormError(t, errors, body, locale, null, context, req, reply)
        }

        return reply.redirect(
          `${destinationPath('fleet', locale)}?aircraft=${created.aircraft.id}`,
          303,
        )
      })

      // Edit aircraft form.
      app.get(fleetPath('aircraft', locale, [':id', 'edit']), requireAuth, async (req, reply) => {
        const t = createTranslator({ locale })
        const pilotId = (req.pilot as NonNullable<typeof req.pilot>).id
        const { id } = req.params as { id: string }
        const aircraft = await repo.findById(pilotId, id)
        if (!aircraft) return reply.callNotFound()

        const html = context.views.render(req, {
          fragment: 'pages/aircraft-form.njk',
          locals: {
            title: t.translate('fleet.edit_aircraft_title'),
            activeNav: 'fleet',
            icon: 'plane',
            action: fleetPath('aircraft', locale, [id, 'edit']),
            values: toView(aircraft, locale),
            errors: {},
            isEdit: true,
          },
        })
        return reply.type('text/html; charset=utf-8').send(html)
      })

      app.post(fleetPath('aircraft', locale, [':id', 'edit']), requireAuth, async (req, reply) => {
        const t = createTranslator({ locale })
        const pilotId = (req.pilot as NonNullable<typeof req.pilot>).id
        const { id } = req.params as { id: string }
        const existing = await repo.findById(pilotId, id)
        if (!existing) return reply.callNotFound()

        const body = (req.body ?? {}) as Record<string, unknown>
        const result = validateAircraftForm(body)
        if (!result.ok) {
          return renderFormError(t, result.errors, body, locale, id, context, req, reply)
        }

        const updated = await repo.update(pilotId, id, result.data)
        if (!updated.ok) {
          const errors: FleetFormErrors = { registration: 'fleet.error.registration_duplicate' }
          return renderFormError(t, errors, body, locale, id, context, req, reply)
        }

        return reply.redirect(`${destinationPath('fleet', locale)}?aircraft=${id}`, 303)
      })

      // Retire (with a confirmation step — GET renders the confirmation,
      // POST performs it).
      app.get(fleetPath('aircraft', locale, [':id', 'delete']), requireAuth, async (req, reply) => {
        const t = createTranslator({ locale })
        const pilotId = (req.pilot as NonNullable<typeof req.pilot>).id
        const { id } = req.params as { id: string }
        const aircraft = await repo.findById(pilotId, id)
        if (!aircraft) return reply.callNotFound()

        const html = context.views.render(req, {
          fragment: 'pages/aircraft-retire.njk',
          locals: {
            title: t.translate('fleet.retire_confirm_title'),
            activeNav: 'fleet',
            icon: 'plane',
            aircraft: toView(aircraft, locale),
            action: fleetPath('aircraft', locale, [id, 'delete']),
            cancelHref: `${destinationPath('fleet', locale)}?aircraft=${id}`,
          },
        })
        return reply.type('text/html; charset=utf-8').send(html)
      })

      app.post(
        fleetPath('aircraft', locale, [':id', 'delete']),
        requireAuth,
        async (req, reply) => {
          const pilotId = (req.pilot as NonNullable<typeof req.pilot>).id
          const { id } = req.params as { id: string }
          const retired = await repo.retire(pilotId, id)
          if (!retired) return reply.callNotFound()
          return reply.redirect(destinationPath('fleet', locale), 303)
        },
      )

      // Set active aircraft.
      app.post(
        fleetPath('aircraft', locale, [':id', 'activate']),
        requireAuth,
        async (req, reply) => {
          const pilotId = (req.pilot as NonNullable<typeof req.pilot>).id
          const { id } = req.params as { id: string }
          const aircraft = await repo.findById(pilotId, id)
          if (!aircraft || aircraft.retiredAt !== null) return reply.callNotFound()
          await repo.setActiveAircraft(pilotId, id)
          return reply.redirect(`${destinationPath('fleet', locale)}?aircraft=${id}`, 303)
        },
      )

      // Add an airworthiness/document validity record.
      app.post(
        fleetPath('aircraft', locale, [':id', 'documents']),
        requireAuth,
        async (req, reply) => {
          const pilotId = (req.pilot as NonNullable<typeof req.pilot>).id
          const { id } = req.params as { id: string }
          const aircraft = await repo.findById(pilotId, id)
          if (!aircraft) return reply.callNotFound()

          const body = (req.body ?? {}) as Record<string, unknown>
          const result = validateDocumentForm(body)
          const backHref = `${destinationPath('fleet', locale)}?aircraft=${id}`
          if (!result.ok) {
            const firstError =
              Object.values(result.errors)[0] ?? 'fleet.error.document_kind_required'
            return reply.redirect(`${backHref}&documentError=${firstError}`, 303)
          }

          const created = await documentsRepo.create(pilotId, id, result.data)
          if (!created.ok) {
            return reply.redirect(`${backHref}&documentError=fleet.error.date_conflict`, 303)
          }
          return reply.redirect(backHref, 303)
        },
      )

      // Weight & balance profile: edit form and whole-profile replace.
      app.get(fleetPath('aircraft', locale, [':id', 'wb']), requireAuth, async (req, reply) => {
        const t = createTranslator({ locale })
        const pilotId = (req.pilot as NonNullable<typeof req.pilot>).id
        const { id } = req.params as { id: string }
        const aircraft = await repo.findById(pilotId, id)
        if (!aircraft) return reply.callNotFound()
        const profile = await wbRepo.get(pilotId, id)

        const html = context.views.render(req, {
          fragment: 'pages/aircraft-wb-form.njk',
          locals: {
            title: t.translate('fleet.wb_title'),
            activeNav: 'fleet',
            icon: 'plane',
            action: fleetPath('aircraft', locale, [id, 'wb']),
            cancelHref: `${destinationPath('fleet', locale)}?aircraft=${id}`,
            profile: wbView(profile),
            rows: WB_FORM_ROWS,
            errors: {},
          },
        })
        return reply.type('text/html; charset=utf-8').send(html)
      })

      app.post(fleetPath('aircraft', locale, [':id', 'wb']), requireAuth, async (req, reply) => {
        const t = createTranslator({ locale })
        const pilotId = (req.pilot as NonNullable<typeof req.pilot>).id
        const { id } = req.params as { id: string }
        const aircraft = await repo.findById(pilotId, id)
        if (!aircraft) return reply.callNotFound()

        const body = (req.body ?? {}) as Record<string, unknown>
        const result = parseWbForm(body)
        if (!result.ok) {
          const translatedErrors: Record<string, string> = {}
          for (const [field, key] of Object.entries(result.errors)) {
            translatedErrors[field] = t.translate(key)
          }
          const profile = await wbRepo.get(pilotId, id)
          const html = context.views.render(req, {
            fragment: 'pages/aircraft-wb-form.njk',
            locals: {
              title: t.translate('fleet.wb_title'),
              activeNav: 'fleet',
              icon: 'plane',
              action: fleetPath('aircraft', locale, [id, 'wb']),
              cancelHref: `${destinationPath('fleet', locale)}?aircraft=${id}`,
              profile: wbView(profile),
              rows: WB_FORM_ROWS,
              errors: translatedErrors,
            },
          })
          return reply.code(422).type('text/html; charset=utf-8').send(html)
        }

        const written = await wbRepo.set(pilotId, id, result.data)
        if (!written.ok) {
          const profile = await wbRepo.get(pilotId, id)
          const html = context.views.render(req, {
            fragment: 'pages/aircraft-wb-form.njk',
            locals: {
              title: t.translate('fleet.wb_title'),
              activeNav: 'fleet',
              icon: 'plane',
              action: fleetPath('aircraft', locale, [id, 'wb']),
              cancelHref: `${destinationPath('fleet', locale)}?aircraft=${id}`,
              profile: wbView(profile),
              rows: WB_FORM_ROWS,
              errors: { general: t.translate('fleet.error.wb_limits_invalid') },
            },
          })
          return reply.code(422).type('text/html; charset=utf-8').send(html)
        }

        return reply.redirect(`${destinationPath('fleet', locale)}?aircraft=${id}`, 303)
      })

      // Flight/FSTD logbook entries.
      app.get(fleetPath('logbook', locale, ['new']), requireAuth, async (req, reply) => {
        const t = createTranslator({ locale })
        const pilotId = (req.pilot as NonNullable<typeof req.pilot>).id
        const query = req.query as { aircraft?: string; fstd?: string }
        const isFstd = query.fstd === '1'
        const aircraftList = await repo.listActive(pilotId)
        const preselectedId = query.aircraft ?? aircraftList[0]?.id ?? null

        let prefill: {
          departureAerodrome: string | null
          hobbsOut: number | null
          tachOut: number | null
        } = {
          departureAerodrome: null,
          hobbsOut: null,
          tachOut: null,
        }
        if (!isFstd && preselectedId) {
          const last = await flightRepo.lastForAircraft(pilotId, preselectedId)
          if (last) {
            prefill = {
              departureAerodrome: last.arrivalAerodrome,
              hobbsOut: last.hobbsIn,
              tachOut: last.tachIn,
            }
          }
        }

        const html = context.views.render(req, {
          fragment: 'pages/aircraft-flight-form.njk',
          locals: {
            title: isFstd
              ? t.translate('fleet.new_fstd_title')
              : t.translate('fleet.new_flight_title'),
            activeNav: 'fleet',
            icon: 'plane',
            action: fleetPath('logbook', locale, ['new']),
            isEdit: false,
            isFstd,
            aircraftOptions: aircraftList.map((a) => ({ id: a.id, registration: a.registration })),
            values: {
              aircraftId: preselectedId,
              flightDate: new Date().toISOString().slice(0, 10),
              ...prefill,
            },
            errors: {},
            cancelHref: preselectedId
              ? `${destinationPath('fleet', locale)}?aircraft=${preselectedId}`
              : destinationPath('fleet', locale),
          },
        })
        return reply.type('text/html; charset=utf-8').send(html)
      })

      app.post(fleetPath('logbook', locale, ['new']), requireAuth, async (req, reply) => {
        const t = createTranslator({ locale })
        const pilotId = (req.pilot as NonNullable<typeof req.pilot>).id
        const body = (req.body ?? {}) as Record<string, unknown>
        const result = validateFlightEntryForm(body)

        const renderError = async (errors: FleetFormErrors) => {
          const translatedErrors: Record<string, string> = {}
          for (const [field, key] of Object.entries(errors))
            translatedErrors[field] = t.translate(key)
          const aircraftList = await repo.listActive(pilotId)
          const isFstd = body.entryType === 'fstd'
          const html = context.views.render(req, {
            fragment: 'pages/aircraft-flight-form.njk',
            locals: {
              title: isFstd
                ? t.translate('fleet.new_fstd_title')
                : t.translate('fleet.new_flight_title'),
              activeNav: 'fleet',
              icon: 'plane',
              action: fleetPath('logbook', locale, ['new']),
              isEdit: false,
              isFstd,
              aircraftOptions: aircraftList.map((a) => ({
                id: a.id,
                registration: a.registration,
              })),
              values: body,
              errors: translatedErrors,
              cancelHref: destinationPath('fleet', locale),
            },
          })
          return reply.code(422).type('text/html; charset=utf-8').send(html)
        }

        if (!result.ok) return renderError(result.errors)

        const created = await flightRepo.create(pilotId, result.data)
        if (!created.ok) return renderError({ aircraftId: 'fleet.error.aircraft_required' })

        const backTo = created.entry.aircraftId
          ? `${destinationPath('fleet', locale)}?aircraft=${created.entry.aircraftId}`
          : destinationPath('fleet', locale)
        return reply.redirect(backTo, 303)
      })

      app.get(fleetPath('logbook', locale, [':id', 'edit']), requireAuth, async (req, reply) => {
        const t = createTranslator({ locale })
        const pilotId = (req.pilot as NonNullable<typeof req.pilot>).id
        const { id } = req.params as { id: string }
        const entry = await flightRepo.findById(pilotId, id)
        if (!entry) return reply.callNotFound()

        const aircraftList = await repo.listActive(pilotId)
        const html = context.views.render(req, {
          fragment: 'pages/aircraft-flight-form.njk',
          locals: {
            title:
              entry.kind === 'fstd'
                ? t.translate('fleet.edit_fstd_title')
                : t.translate('fleet.edit_flight_title'),
            activeNav: 'fleet',
            icon: 'plane',
            action: fleetPath('logbook', locale, [id, 'edit']),
            isEdit: true,
            isFstd: entry.kind === 'fstd',
            aircraftOptions: aircraftList.map((a) => ({ id: a.id, registration: a.registration })),
            values: {
              aircraftId: entry.aircraftId,
              flightDate: entry.flightDate,
              departureAerodrome: entry.departureAerodrome,
              departureTime: entry.departureTime,
              arrivalAerodrome: entry.arrivalAerodrome,
              arrivalTime: entry.arrivalTime,
              pilotFunction: entry.pilotFunction,
              totalTime: formatMinutesAsDecimalHours(entry.totalMinutes),
              nightTime: formatMinutesAsDecimalHours(entry.nightMinutes),
              ifrTime: formatMinutesAsDecimalHours(entry.ifrMinutes),
              crossCountryTime: formatMinutesAsDecimalHours(entry.crossCountryMinutes),
              instrumentTime: formatMinutesAsDecimalHours(entry.instrumentMinutes),
              hobbsOut: entry.hobbsOut,
              hobbsIn: entry.hobbsIn,
              tachOut: entry.tachOut,
              tachIn: entry.tachIn,
              fuelUplift: entry.fuelUplift,
              fuelBurn: entry.fuelBurn,
              dayLandings: entry.dayLandings,
              nightLandings: entry.nightLandings,
              passengers: entry.passengers,
              remarks: entry.remarks,
              deviceType: entry.deviceType,
              deviceQualification: entry.deviceQualification,
            },
            errors: {},
            cancelHref: entry.aircraftId
              ? `${destinationPath('fleet', locale)}?aircraft=${entry.aircraftId}`
              : destinationPath('fleet', locale),
          },
        })
        return reply.type('text/html; charset=utf-8').send(html)
      })

      app.post(fleetPath('logbook', locale, [':id', 'edit']), requireAuth, async (req, reply) => {
        const t = createTranslator({ locale })
        const pilotId = (req.pilot as NonNullable<typeof req.pilot>).id
        const { id } = req.params as { id: string }
        const existing = await flightRepo.findById(pilotId, id)
        if (!existing) return reply.callNotFound()

        const body = (req.body ?? {}) as Record<string, unknown>
        const result = validateFlightEntryForm(body)

        const renderError = async (errors: FleetFormErrors) => {
          const translatedErrors: Record<string, string> = {}
          for (const [field, key] of Object.entries(errors))
            translatedErrors[field] = t.translate(key)
          const aircraftList = await repo.listActive(pilotId)
          const html = context.views.render(req, {
            fragment: 'pages/aircraft-flight-form.njk',
            locals: {
              title:
                existing.kind === 'fstd'
                  ? t.translate('fleet.edit_fstd_title')
                  : t.translate('fleet.edit_flight_title'),
              activeNav: 'fleet',
              icon: 'plane',
              action: fleetPath('logbook', locale, [id, 'edit']),
              isEdit: true,
              isFstd: existing.kind === 'fstd',
              aircraftOptions: aircraftList.map((a) => ({
                id: a.id,
                registration: a.registration,
              })),
              values: body,
              errors: translatedErrors,
              cancelHref: destinationPath('fleet', locale),
            },
          })
          return reply.code(422).type('text/html; charset=utf-8').send(html)
        }

        if (!result.ok) return renderError(result.errors)

        const updated = await flightRepo.update(pilotId, id, result.data)
        if (!updated.ok) return renderError({ aircraftId: 'fleet.error.aircraft_required' })

        const backTo = updated.entry.aircraftId
          ? `${destinationPath('fleet', locale)}?aircraft=${updated.entry.aircraftId}`
          : destinationPath('fleet', locale)
        return reply.redirect(backTo, 303)
      })

      // Delete a logbook entry (with confirmation).
      app.get(fleetPath('logbook', locale, [':id', 'delete']), requireAuth, async (req, reply) => {
        const t = createTranslator({ locale })
        const pilotId = (req.pilot as NonNullable<typeof req.pilot>).id
        const { id } = req.params as { id: string }
        const entry = await flightRepo.findById(pilotId, id)
        if (!entry) return reply.callNotFound()

        const html = context.views.render(req, {
          fragment: 'pages/aircraft-flight-delete.njk',
          locals: {
            title: t.translate('fleet.delete_entry_title'),
            activeNav: 'fleet',
            icon: 'plane',
            entry: entryView(entry, locale),
            action: fleetPath('logbook', locale, [id, 'delete']),
            cancelHref: entry.aircraftId
              ? `${destinationPath('fleet', locale)}?aircraft=${entry.aircraftId}`
              : destinationPath('fleet', locale),
          },
        })
        return reply.type('text/html; charset=utf-8').send(html)
      })

      app.post(fleetPath('logbook', locale, [':id', 'delete']), requireAuth, async (req, reply) => {
        const pilotId = (req.pilot as NonNullable<typeof req.pilot>).id
        const { id } = req.params as { id: string }
        const entry = await flightRepo.findById(pilotId, id)
        if (!entry) return reply.callNotFound()
        await flightRepo.delete(pilotId, id)
        const backTo = entry.aircraftId
          ? `${destinationPath('fleet', locale)}?aircraft=${entry.aircraftId}`
          : destinationPath('fleet', locale)
        return reply.redirect(backTo, 303)
      })

      // Maintenance items.
      app.get(
        fleetPath('maintenance', locale, [':aircraftId', 'new']),
        requireAuth,
        async (req, reply) => {
          const t = createTranslator({ locale })
          const pilotId = (req.pilot as NonNullable<typeof req.pilot>).id
          const { aircraftId } = req.params as { aircraftId: string }
          const aircraft = await repo.findById(pilotId, aircraftId)
          if (!aircraft) return reply.callNotFound()

          const html = context.views.render(req, {
            fragment: 'pages/aircraft-maintenance-form.njk',
            locals: {
              title: t.translate('fleet.new_maintenance_title'),
              activeNav: 'fleet',
              icon: 'plane',
              action: fleetPath('maintenance', locale, [aircraftId, 'new']),
              values: {},
              errors: {},
              cancelHref: `${destinationPath('fleet', locale)}?aircraft=${aircraftId}`,
            },
          })
          return reply.type('text/html; charset=utf-8').send(html)
        },
      )

      app.post(
        fleetPath('maintenance', locale, [':aircraftId', 'new']),
        requireAuth,
        async (req, reply) => {
          const t = createTranslator({ locale })
          const pilotId = (req.pilot as NonNullable<typeof req.pilot>).id
          const { aircraftId } = req.params as { aircraftId: string }
          const aircraft = await repo.findById(pilotId, aircraftId)
          if (!aircraft) return reply.callNotFound()

          const body = (req.body ?? {}) as Record<string, unknown>
          const result = validateMaintenanceItemForm(body)
          if (!result.ok) {
            const translatedErrors: Record<string, string> = {}
            for (const [field, key] of Object.entries(result.errors)) {
              translatedErrors[field] = t.translate(key)
            }
            const html = context.views.render(req, {
              fragment: 'pages/aircraft-maintenance-form.njk',
              locals: {
                title: t.translate('fleet.new_maintenance_title'),
                activeNav: 'fleet',
                icon: 'plane',
                action: fleetPath('maintenance', locale, [aircraftId, 'new']),
                values: body,
                errors: translatedErrors,
                cancelHref: `${destinationPath('fleet', locale)}?aircraft=${aircraftId}`,
              },
            })
            return reply.code(422).type('text/html; charset=utf-8').send(html)
          }

          await maintenanceRepo.create(pilotId, aircraftId, result.data)
          return reply.redirect(`${destinationPath('fleet', locale)}?aircraft=${aircraftId}`, 303)
        },
      )

      app.get(
        fleetPath('maintenance', locale, [':id', 'complete']),
        requireAuth,
        async (req, reply) => {
          const t = createTranslator({ locale })
          const pilotId = (req.pilot as NonNullable<typeof req.pilot>).id
          const { id } = req.params as { id: string }
          const item = await maintenanceRepo.findById(pilotId, id)
          if (!item) return reply.callNotFound()

          const html = context.views.render(req, {
            fragment: 'pages/aircraft-maintenance-complete.njk',
            locals: {
              title: t.translate('fleet.complete_maintenance_title'),
              activeNav: 'fleet',
              icon: 'plane',
              item: { description: item.description },
              action: fleetPath('maintenance', locale, [id, 'complete']),
              values: { completedOn: new Date().toISOString().slice(0, 10) },
              errors: {},
              cancelHref: `${destinationPath('fleet', locale)}?aircraft=${item.aircraftId}`,
            },
          })
          return reply.type('text/html; charset=utf-8').send(html)
        },
      )

      app.post(
        fleetPath('maintenance', locale, [':id', 'complete']),
        requireAuth,
        async (req, reply) => {
          const t = createTranslator({ locale })
          const pilotId = (req.pilot as NonNullable<typeof req.pilot>).id
          const { id } = req.params as { id: string }
          const item = await maintenanceRepo.findById(pilotId, id)
          if (!item) return reply.callNotFound()

          const body = (req.body ?? {}) as Record<string, unknown>
          const result = validateCompleteMaintenanceForm(body)
          if (!result.ok) {
            const translatedErrors: Record<string, string> = {}
            for (const [field, key] of Object.entries(result.errors)) {
              translatedErrors[field] = t.translate(key)
            }
            const html = context.views.render(req, {
              fragment: 'pages/aircraft-maintenance-complete.njk',
              locals: {
                title: t.translate('fleet.complete_maintenance_title'),
                activeNav: 'fleet',
                icon: 'plane',
                item: { description: item.description },
                action: fleetPath('maintenance', locale, [id, 'complete']),
                values: body,
                errors: translatedErrors,
                cancelHref: `${destinationPath('fleet', locale)}?aircraft=${item.aircraftId}`,
              },
            })
            return reply.code(422).type('text/html; charset=utf-8').send(html)
          }

          await maintenanceRepo.complete(pilotId, id, result.data)
          return reply.redirect(
            `${destinationPath('fleet', locale)}?aircraft=${item.aircraftId}`,
            303,
          )
        },
      )

      // Engine data import (engine-data-import capability). Multipart body:
      // CSRF is verified manually here since the global preValidation hook
      // skips multipart requests (auth-plugin.ts).
      app.post(
        fleetPath('engine-data', locale, [':flightEntryId', 'upload']),
        requireAuth,
        async (req, reply) => {
          const pilotId = (req.pilot as NonNullable<typeof req.pilot>).id
          const { flightEntryId } = req.params as { flightEntryId: string }
          const entry = await flightRepo.findById(pilotId, flightEntryId)
          if (!entry) return reply.callNotFound()
          const backHref = `${destinationPath('fleet', locale)}?aircraft=${entry.aircraftId}`

          let fileBuffer: Buffer | null = null
          let filename = ''
          let truncated = false
          let csrfToken = ''
          for await (const part of req.parts()) {
            if (part.type === 'file') {
              filename = part.filename
              fileBuffer = await part.toBuffer()
              truncated = Boolean((part.file as unknown as { truncated?: boolean }).truncated)
            } else if (part.fieldname === 'csrfToken') {
              csrfToken = String(part.value)
            }
          }

          const identity = req.sessionToken ?? req.cookies[CSRF_NONCE_COOKIE] ?? ''
          if (!verifyCsrfToken(context.config.SESSION_SECRET, identity, csrfToken)) {
            return reply
              .code(403)
              .send({ statusCode: 403, message: 'csrf token missing or invalid' })
          }

          if (truncated) {
            return reply.redirect(
              `${backHref}&engineDataError=fleet.error.engine_data_too_large`,
              303,
            )
          }
          if (!fileBuffer) {
            return reply.redirect(`${backHref}&engineDataError=fleet.error.engine_data_empty`, 303)
          }

          const parsed = importEngineData(fileBuffer, filename)
          if (!parsed.ok) {
            return reply.redirect(
              `${backHref}&engineDataError=fleet.error.engine_data_${parsed.reason}`,
              303,
            )
          }

          await engineDataRepo.replace(pilotId, flightEntryId, parsed.data)
          return reply.redirect(backHref, 303)
        },
      )

      app.post(
        fleetPath('engine-data', locale, [':flightEntryId', 'delete']),
        requireAuth,
        async (req, reply) => {
          const pilotId = (req.pilot as NonNullable<typeof req.pilot>).id
          const { flightEntryId } = req.params as { flightEntryId: string }
          const entry = await flightRepo.findById(pilotId, flightEntryId)
          if (!entry) return reply.callNotFound()
          await engineDataRepo.delete(pilotId, flightEntryId)
          return reply.redirect(
            `${destinationPath('fleet', locale)}?aircraft=${entry.aircraftId}`,
            303,
          )
        },
      )

      // Pilot-entered per-channel engine limits, stored on the aircraft.
      app.get(
        fleetPath('aircraft', locale, [':id', 'engine-data']),
        requireAuth,
        async (req, reply) => {
          const t = createTranslator({ locale })
          const pilotId = (req.pilot as NonNullable<typeof req.pilot>).id
          const { id } = req.params as { id: string }
          const aircraft = await repo.findById(pilotId, id)
          if (!aircraft) return reply.callNotFound()
          const limits = (await engineDataRepo.getAircraftLimits(pilotId, id)) ?? {}

          const html = context.views.render(req, {
            fragment: 'pages/aircraft-engine-limits-form.njk',
            locals: {
              title: t.translate('fleet.engine_limits_title'),
              activeNav: 'fleet',
              icon: 'plane',
              action: fleetPath('aircraft', locale, [id, 'engine-data']),
              channels: ENGINE_LIMIT_CHANNELS,
              values: limits,
              cancelHref: `${destinationPath('fleet', locale)}?aircraft=${id}`,
            },
          })
          return reply.type('text/html; charset=utf-8').send(html)
        },
      )

      app.post(
        fleetPath('aircraft', locale, [':id', 'engine-data']),
        requireAuth,
        async (req, reply) => {
          const pilotId = (req.pilot as NonNullable<typeof req.pilot>).id
          const { id } = req.params as { id: string }
          const aircraft = await repo.findById(pilotId, id)
          if (!aircraft) return reply.callNotFound()

          const body = (req.body ?? {}) as Record<string, unknown>
          const limits: EngineLimits = {}
          for (const key of ENGINE_LIMIT_CHANNELS) {
            const raw = body[key]
            if (typeof raw === 'string' && raw.trim().length > 0) {
              const num = Number(raw.trim())
              if (Number.isFinite(num)) limits[key] = num
            }
          }
          await engineDataRepo.setAircraftLimits(pilotId, id, limits)
          return reply.redirect(`${destinationPath('fleet', locale)}?aircraft=${id}`, 303)
        },
      )
    }

    function renderFormError(
      t: ReturnType<typeof createTranslator>,
      errors: FleetFormErrors,
      body: Record<string, unknown>,
      locale: SupportedLocale,
      id: string | null,
      ctx: ModuleContext,
      req: FastifyRequest,
      reply: FastifyReply,
    ) {
      const translatedErrors: Record<string, string> = {}
      for (const [field, key] of Object.entries(errors)) translatedErrors[field] = t.translate(key)

      const html = ctx.views.render(req, {
        fragment: 'pages/aircraft-form.njk',
        locals: {
          title: id
            ? t.translate('fleet.edit_aircraft_title')
            : t.translate('fleet.new_aircraft_title'),
          activeNav: 'fleet',
          icon: 'plane',
          action: id
            ? fleetPath('aircraft', locale, [id, 'edit'])
            : fleetPath('aircraft', locale, ['new']),
          values: body,
          errors: translatedErrors,
          isEdit: id !== null,
        },
      })
      return reply.code(422).type('text/html; charset=utf-8').send(html)
    }
  },
}
