import type { FastifyRequest } from 'fastify'

import type { FeatureModule } from '../types.js'
import { createTranslator } from '../../platform/i18n/catalog.js'
import { SUPPORTED_LOCALES, type SupportedLocale } from '../../platform/i18n/locale.js'
import { destinationPath } from '../../platform/i18n/segments.js'
import { createRequireAuthHook } from '../../server/auth/auth-plugin.js'
import { createAircraftRepo } from '../../platform/fleet/aircraft-repo.js'
import { createFlightIntentRepo } from '../../platform/risk/flight-intent-repo.js'
import { createChecklistRepo } from '../../platform/checklists/checklist-repo.js'
import { createRunRepo } from '../../platform/checklists/run-repo.js'
import type {
  Checklist,
  ChecklistItem,
  ChecklistRunItem,
  ChecklistRunWithItems,
  ChecklistWithItems,
} from '../../platform/checklists/types.js'
import type { FlightIntentRecord } from '../../platform/risk/types.js'
import {
  validateChecklistForm,
  validateChecklistItemForm,
  validateChecklistNameForm,
  type ChecklistFormErrors,
} from './forms.js'
import { checklistItemsPath, checklistPath, checklistSelectorPath } from './paths.js'

function makeSignInUrlBuilder(locale: SupportedLocale): (req: FastifyRequest) => string {
  return (req) => `/${locale}/auth/sign-in?next=${encodeURIComponent(req.url)}`
}

/** The pilot's soonest flight intent planned on or after today's UTC date
 * (design decision 8 / checklist-runs: "Running a normal checklist is
 * scoped to a planned flight"). Duplicated from `modules/dashboard/service.ts`
 * rather than imported — the module-boundary rule forbids one feature
 * module importing another's internals, and this selection is a handful of
 * lines (dashboard/service.ts carries the same note for its own
 * duplication). */
function selectNextIntent(
  intents: readonly FlightIntentRecord[],
  now: Date,
): FlightIntentRecord | null {
  const today = now.toISOString().slice(0, 10)
  const upcoming = intents.filter((i) => i.plannedDate >= today)
  if (upcoming.length === 0) return null
  upcoming.sort((a, b) => {
    if (a.plannedDate !== b.plannedDate) return a.plannedDate < b.plannedDate ? -1 : 1
    return a.createdAt.getTime() - b.createdAt.getTime()
  })
  return upcoming[0] as FlightIntentRecord
}

function isHtmxRequest(req: FastifyRequest): boolean {
  return req.headers['hx-request'] === 'true'
}

/** Every checklists module: platform/checklists so the module.register
 * closure can compose the three repos it needs. */
export const checklistsModule: FeatureModule = {
  id: 'checklists',
  labelKey: 'nav.checklists',
  icon: 'list',
  order: 3,
  register: (app, context) => {
    const aircraftRepo = createAircraftRepo(context.pool)
    const flightIntentRepo = createFlightIntentRepo(context.pool)
    const checklistRepo = createChecklistRepo(context.pool)
    const runRepo = createRunRepo(context.pool)

    for (const locale of SUPPORTED_LOCALES) {
      const requireAuth = { onRequest: createRequireAuthHook(makeSignInUrlBuilder(locale)) }

      // --- Presentation shapes -------------------------------------------

      function fleetRow(
        aircraft: { id: string; registration: string },
        selectedId: string | null,
        activeAircraftId: string | null,
      ) {
        return {
          id: aircraft.id,
          registration: aircraft.registration,
          href: checklistSelectorPath(locale, aircraft.id),
          selected: aircraft.id === selectedId,
          isActiveAircraft: aircraft.id === activeAircraftId,
        }
      }

      function selectorRow(checklist: Checklist, aircraftId: string) {
        return {
          id: checklist.id,
          name: checklist.name,
          href: checklistItemsPath(locale, aircraftId, checklist.id),
          isTemplate: checklist.source === 'template',
          isPreflight: checklist.role === 'preflight',
        }
      }

      function manageItemRow(item: ChecklistItem, aircraftId: string, checklistId: string) {
        return {
          id: item.id,
          text: item.text,
          updateHref: checklistPath('items', locale, [aircraftId, checklistId, item.id, 'edit']),
          moveUpHref: checklistPath('items', locale, [aircraftId, checklistId, item.id, 'move-up']),
          moveDownHref: checklistPath('items', locale, [
            aircraftId,
            checklistId,
            item.id,
            'move-down',
          ]),
          deleteHref: checklistPath('items', locale, [aircraftId, checklistId, item.id, 'delete']),
        }
      }

      function runItemRow(item: ChecklistRunItem, aircraftId: string, checklistId: string) {
        return {
          id: item.id,
          text: item.text,
          checked: item.checkedAt !== null,
          toggleHref: checklistPath('toggle', locale, [aircraftId, checklistId, item.id]),
        }
      }

      function progressLocals(run: ChecklistRunWithItems, aircraftId: string, checklistId: string) {
        const checkedCount = run.items.filter((i) => i.checkedAt !== null).length
        return {
          checkedCount,
          totalCount: run.items.length,
          completed: run.completedAt !== null,
          resetHref: checklistPath('reset', locale, [aircraftId, checklistId]),
        }
      }

      /** Builds the whole page's view model at the requested level. `t` is
       * used only for the `general` error key resolution — screen labels are
       * translated in the template. */
      async function buildViewModel(opts: {
        pilotId: string
        aircraftId: string | null
        checklistId: string | null
        formError: string | null
        now: Date
      }) {
        const { pilotId, aircraftId, checklistId, formError } = opts
        const [aircraftList, active] = await Promise.all([
          aircraftRepo.listActive(pilotId),
          aircraftRepo.getActiveAircraft(pilotId),
        ])

        const fleet = {
          aircraft: aircraftList.map((a) => fleetRow(a, aircraftId, active?.id ?? null)),
          newAircraftHref: destinationPath('fleet', locale),
          empty: aircraftList.length === 0,
        }

        let selector = null as null | Record<string, unknown>
        let items = null as null | Record<string, unknown>
        let level: 'fleet' | 'selector' | 'items' = 'fleet'

        if (aircraftId) {
          const aircraft =
            aircraftList.find((a) => a.id === aircraftId) ??
            (await aircraftRepo.findById(pilotId, aircraftId))
          if (aircraft) {
            level = 'selector'
            const library = await checklistRepo.listForAircraft(pilotId, aircraftId)
            selector = {
              aircraftId,
              aircraftRegistration: aircraft.registration,
              backHref: destinationPath('checklists', locale),
              normal: library
                .filter((c) => c.kind === 'normal')
                .map((c) => selectorRow(c, aircraftId)),
              emergency: library
                .filter((c) => c.kind === 'emergency')
                .map((c) => selectorRow(c, aircraftId)),
              newChecklistHref: checklistPath('new', locale, [aircraftId]),
              historyHref: checklistPath('history', locale, [aircraftId]),
              empty: library.length === 0,
              formError,
            }

            if (checklistId) {
              const checklist = await checklistRepo.findById(pilotId, checklistId)
              if (checklist && checklist.aircraftId === aircraftId) {
                level = 'items'
                items = await buildItemsPane(pilotId, aircraftId, checklist, formError, opts.now)
              }
            }
          }
        }

        return { level, fleet, selector, items }
      }

      async function buildItemsPane(
        pilotId: string,
        aircraftId: string,
        checklist: ChecklistWithItems,
        formError: string | null,
        now: Date,
      ) {
        const base = {
          checklistId: checklist.id,
          checklistName: checklist.name,
          kind: checklist.kind,
          isTemplate: checklist.source === 'template',
          isPreflight: checklist.role === 'preflight',
          backHref: checklistSelectorPath(locale, aircraftId),
          renameHref: checklistPath('edit', locale, [aircraftId, checklist.id]),
          deleteHref: checklistPath('delete', locale, [aircraftId, checklist.id]),
          moveUpHref: checklistPath('move-up', locale, [aircraftId, checklist.id]),
          moveDownHref: checklistPath('move-down', locale, [aircraftId, checklist.id]),
          preflightHref:
            checklist.kind === 'normal'
              ? checklistPath('preflight', locale, [aircraftId, checklist.id])
              : null,
          addItemHref: checklistPath('items', locale, [aircraftId, checklist.id, 'new']),
          manageItems: checklist.items.map((i) => manageItemRow(i, aircraftId, checklist.id)),
          hasItems: checklist.items.length > 0,
          formError,
          runState: 'not-applicable' as
            'not-applicable' | 'no-intent' | 'empty' | 'active' | 'completed',
          planFlightHref: null as string | null,
          runItems: [] as ReturnType<typeof runItemRow>[],
          checkedCount: null as number | null,
          totalCount: null as number | null,
          resetHref: null as string | null,
        }

        if (checklist.kind === 'emergency') return base

        if (!checklist.items.length) {
          return { ...base, runState: 'empty' as const }
        }

        const intents = await flightIntentRepo.listForPilot(pilotId)
        const nextIntent = selectNextIntent(intents, now)
        if (!nextIntent) {
          return {
            ...base,
            runState: 'no-intent' as const,
            planFlightHref: destinationPath('risk', locale),
          }
        }

        const started = await runRepo.openOrStart(pilotId, checklist.id, nextIntent.id)
        if (!started.ok) return { ...base, runState: 'empty' as const }

        return {
          ...base,
          runState: 'active' as const,
          runItems: started.run.items.map((i) => runItemRow(i, aircraftId, checklist.id)),
          ...progressLocals(started.run, aircraftId, checklist.id),
        }
      }

      function render(
        req: FastifyRequest,
        reply: { type: (t: string) => { send: (b: string) => unknown } },
        vm: Awaited<ReturnType<typeof buildViewModel>>,
      ) {
        const t = createTranslator({ locale })
        const html = context.views.render(req, {
          fragment: 'pages/checklists.njk',
          locals: {
            title: t.translate('nav.checklists'),
            activeNav: 'checklists',
            icon: 'list',
            vm,
          },
        })
        return reply.type('text/html; charset=utf-8').send(html)
      }

      // --- Browse levels ---------------------------------------------------

      app.get(destinationPath('checklists', locale), requireAuth, async (req, reply) => {
        const pilotId = (req.pilot as NonNullable<typeof req.pilot>).id
        const vm = await buildViewModel({
          pilotId,
          aircraftId: null,
          checklistId: null,
          formError: null,
          now: new Date(),
        })
        return render(req, reply as never, vm)
      })

      app.get(
        `${destinationPath('checklists', locale)}/:aircraftId`,
        requireAuth,
        async (req, reply) => {
          const pilotId = (req.pilot as NonNullable<typeof req.pilot>).id
          const { aircraftId } = req.params as { aircraftId: string }
          const query = req.query as { error?: string }
          const t = createTranslator({ locale })
          const vm = await buildViewModel({
            pilotId,
            aircraftId,
            checklistId: null,
            formError: query.error ? t.translate(query.error) : null,
            now: new Date(),
          })
          if (vm.level === 'fleet') return reply.callNotFound()
          return render(req, reply as never, vm)
        },
      )

      app.get(
        `${destinationPath('checklists', locale)}/:aircraftId/:checklistId`,
        requireAuth,
        async (req, reply) => {
          const pilotId = (req.pilot as NonNullable<typeof req.pilot>).id
          const { aircraftId, checklistId } = req.params as {
            aircraftId: string
            checklistId: string
          }
          const query = req.query as { error?: string }
          const t = createTranslator({ locale })
          const vm = await buildViewModel({
            pilotId,
            aircraftId,
            checklistId,
            formError: query.error ? t.translate(query.error) : null,
            now: new Date(),
          })
          if (vm.level !== 'items') return reply.callNotFound()
          return render(req, reply as never, vm)
        },
      )

      // --- History -----------------------------------------------------

      app.get(
        checklistPath('history', locale, [':aircraftId']),
        requireAuth,
        async (req, reply) => {
          const t = createTranslator({ locale })
          const pilotId = (req.pilot as NonNullable<typeof req.pilot>).id
          const { aircraftId } = req.params as { aircraftId: string }
          const aircraft = await aircraftRepo.findById(pilotId, aircraftId)
          if (!aircraft) return reply.callNotFound()

          const runs = await runRepo.listCompletedForAircraft(pilotId, aircraftId)
          const intents = await flightIntentRepo.listForPilot(pilotId)
          const intentById = new Map(intents.map((i) => [i.id, i]))

          const html = context.views.render(req, {
            fragment: 'pages/checklist-history.njk',
            locals: {
              title: t.translate('checklist.history_title'),
              activeNav: 'checklists',
              icon: 'list',
              aircraftId,
              aircraftRegistration: aircraft.registration,
              backHref: checklistSelectorPath(locale, aircraftId),
              runs: runs.map((r) => ({
                id: r.id,
                checklistName: r.checklistName,
                completedAt: r.completedAt,
                flightIntent: intentById.get(r.flightIntentId) ?? null,
                href: `${checklistPath('history', locale, [aircraftId])}/${r.id}`,
              })),
            },
          })
          return reply.type('text/html; charset=utf-8').send(html)
        },
      )

      app.get(
        `${checklistPath('history', locale, [':aircraftId'])}/:runId`,
        requireAuth,
        async (req, reply) => {
          const pilotId = (req.pilot as NonNullable<typeof req.pilot>).id
          const { aircraftId, runId } = req.params as { aircraftId: string; runId: string }
          const run = await runRepo.findById(pilotId, runId)
          if (!run || run.aircraftId !== aircraftId || run.completedAt === null) {
            return reply.callNotFound()
          }
          const intent = await flightIntentRepo.findById(pilotId, run.flightIntentId)

          const html = context.views.render(req, {
            fragment: 'pages/checklist-history-detail.njk',
            locals: {
              title: run.checklistName,
              activeNav: 'checklists',
              icon: 'list',
              run: {
                checklistName: run.checklistName,
                completedAt: run.completedAt,
                flightIntent: intent,
                items: run.items.map((i) => ({ text: i.text, checked: i.checkedAt !== null })),
              },
              backHref: checklistPath('history', locale, [aircraftId]),
            },
          })
          return reply.type('text/html; charset=utf-8').send(html)
        },
      )

      // --- Run actions -----------------------------------------------------

      app.post(
        checklistPath('toggle', locale, [':aircraftId', ':checklistId', ':runItemId']),
        requireAuth,
        async (req, reply) => {
          const pilotId = (req.pilot as NonNullable<typeof req.pilot>).id
          const { aircraftId, checklistId, runItemId } = req.params as {
            aircraftId: string
            checklistId: string
            runItemId: string
          }
          const checklist = await checklistRepo.findById(pilotId, checklistId)
          if (!checklist || checklist.aircraftId !== aircraftId) return reply.callNotFound()
          if (checklist.kind === 'emergency') return reply.code(400).send()

          const intents = await flightIntentRepo.listForPilot(pilotId)
          const nextIntent = selectNextIntent(intents, new Date())
          if (!nextIntent) return reply.code(400).send()

          const started = await runRepo.openOrStart(pilotId, checklistId, nextIntent.id)
          if (!started.ok) return reply.code(400).send()

          const result = await runRepo.toggleItem(pilotId, started.run.id, runItemId)
          if (!result.ok) return reply.code(400).send()

          if (isHtmxRequest(req)) {
            const itemHtml = context.views.render(req, {
              fragment: 'partials/checklist-item.njk',
              locals: {
                item: runItemRow(
                  result.run.items.find((i) => i.id === runItemId) as ChecklistRunItem,
                  aircraftId,
                  checklistId,
                ),
              },
            })
            const progressHtml = context.views.render(req, {
              fragment: 'partials/checklist-progress.njk',
              locals: { progress: progressLocals(result.run, aircraftId, checklistId) },
            })
            return reply
              .type('text/html; charset=utf-8')
              .send(
                itemHtml + `<div id="checklist-progress" hx-swap-oob="true">${progressHtml}</div>`,
              )
          }

          const target = result.run.completedAt
            ? `${checklistPath('history', locale, [aircraftId])}/${result.run.id}`
            : checklistItemsPath(locale, aircraftId, checklistId)
          return reply.redirect(target, 303)
        },
      )

      app.post(
        checklistPath('reset', locale, [':aircraftId', ':checklistId']),
        requireAuth,
        async (req, reply) => {
          const pilotId = (req.pilot as NonNullable<typeof req.pilot>).id
          const { aircraftId, checklistId } = req.params as {
            aircraftId: string
            checklistId: string
          }
          const checklist = await checklistRepo.findById(pilotId, checklistId)
          if (!checklist || checklist.aircraftId !== aircraftId) return reply.callNotFound()

          const intents = await flightIntentRepo.listForPilot(pilotId)
          const nextIntent = selectNextIntent(intents, new Date())
          if (!nextIntent) return reply.code(400).send()
          const started = await runRepo.openOrStart(pilotId, checklistId, nextIntent.id)
          if (!started.ok) return reply.code(400).send()

          await runRepo.reset(pilotId, started.run.id)
          return reply.redirect(checklistItemsPath(locale, aircraftId, checklistId), 303)
        },
      )

      // --- Checklist CRUD ---------------------------------------------------

      app.post(checklistPath('new', locale, [':aircraftId']), requireAuth, async (req, reply) => {
        const pilotId = (req.pilot as NonNullable<typeof req.pilot>).id
        const { aircraftId } = req.params as { aircraftId: string }
        const body = { ...((req.body ?? {}) as Record<string, unknown>), aircraftId }
        const result = validateChecklistForm(body)
        if (!result.ok)
          return redirectWithError(reply, checklistSelectorPath(locale, aircraftId), result.errors)

        const created = await checklistRepo.create(pilotId, result.data)
        if (!created.ok) return reply.callNotFound()
        return reply.redirect(checklistItemsPath(locale, aircraftId, created.checklist.id), 303)
      })

      app.post(
        checklistPath('edit', locale, [':aircraftId', ':checklistId']),
        requireAuth,
        async (req, reply) => {
          const pilotId = (req.pilot as NonNullable<typeof req.pilot>).id
          const { aircraftId, checklistId } = req.params as {
            aircraftId: string
            checklistId: string
          }
          const body = (req.body ?? {}) as Record<string, unknown>
          const result = validateChecklistNameForm(body)
          const backTo = checklistItemsPath(locale, aircraftId, checklistId)
          if (!result.ok) return redirectWithError(reply, backTo, result.errors)

          const renamed = await checklistRepo.rename(pilotId, checklistId, result.data.name)
          if (!renamed.ok) return reply.callNotFound()
          return reply.redirect(backTo, 303)
        },
      )

      app.post(
        checklistPath('delete', locale, [':aircraftId', ':checklistId']),
        requireAuth,
        async (req, reply) => {
          const pilotId = (req.pilot as NonNullable<typeof req.pilot>).id
          const { aircraftId, checklistId } = req.params as {
            aircraftId: string
            checklistId: string
          }
          await checklistRepo.remove(pilotId, checklistId)
          return reply.redirect(checklistSelectorPath(locale, aircraftId), 303)
        },
      )

      app.post(
        checklistPath('move-up', locale, [':aircraftId', ':checklistId']),
        requireAuth,
        async (req, reply) => {
          const pilotId = (req.pilot as NonNullable<typeof req.pilot>).id
          const { aircraftId, checklistId } = req.params as {
            aircraftId: string
            checklistId: string
          }
          await checklistRepo.move(pilotId, checklistId, 'up')
          return reply.redirect(checklistSelectorPath(locale, aircraftId), 303)
        },
      )

      app.post(
        checklistPath('move-down', locale, [':aircraftId', ':checklistId']),
        requireAuth,
        async (req, reply) => {
          const pilotId = (req.pilot as NonNullable<typeof req.pilot>).id
          const { aircraftId, checklistId } = req.params as {
            aircraftId: string
            checklistId: string
          }
          await checklistRepo.move(pilotId, checklistId, 'down')
          return reply.redirect(checklistSelectorPath(locale, aircraftId), 303)
        },
      )

      app.post(
        checklistPath('preflight', locale, [':aircraftId', ':checklistId']),
        requireAuth,
        async (req, reply) => {
          const pilotId = (req.pilot as NonNullable<typeof req.pilot>).id
          const { aircraftId, checklistId } = req.params as {
            aircraftId: string
            checklistId: string
          }
          const backTo = checklistItemsPath(locale, aircraftId, checklistId)
          const result = await checklistRepo.setPreflightRole(pilotId, aircraftId, checklistId)
          if (!result.ok) {
            const key =
              result.reason === 'cannot_be_emergency'
                ? 'checklist.error.preflight_emergency'
                : 'checklist.error.not_found'
            return redirectWithError(reply, backTo, { general: key })
          }
          return reply.redirect(backTo, 303)
        },
      )

      // --- Item CRUD ---------------------------------------------------

      app.post(
        checklistPath('items', locale, [':aircraftId', ':checklistId', 'new']),
        requireAuth,
        async (req, reply) => {
          const pilotId = (req.pilot as NonNullable<typeof req.pilot>).id
          const { aircraftId, checklistId } = req.params as {
            aircraftId: string
            checklistId: string
          }
          const backTo = checklistItemsPath(locale, aircraftId, checklistId)
          const body = (req.body ?? {}) as Record<string, unknown>
          const result = validateChecklistItemForm(body)
          if (!result.ok) return redirectWithError(reply, backTo, result.errors)

          const created = await checklistRepo.addItem(pilotId, checklistId, result.data.text)
          if (!created) return reply.callNotFound()
          return reply.redirect(backTo, 303)
        },
      )

      app.post(
        checklistPath('items', locale, [':aircraftId', ':checklistId', ':itemId', 'edit']),
        requireAuth,
        async (req, reply) => {
          const pilotId = (req.pilot as NonNullable<typeof req.pilot>).id
          const { aircraftId, checklistId, itemId } = req.params as {
            aircraftId: string
            checklistId: string
            itemId: string
          }
          const backTo = checklistItemsPath(locale, aircraftId, checklistId)
          const body = (req.body ?? {}) as Record<string, unknown>
          const result = validateChecklistItemForm(body)
          if (!result.ok) return redirectWithError(reply, backTo, result.errors)

          const updated = await checklistRepo.updateItem(
            pilotId,
            checklistId,
            itemId,
            result.data.text,
          )
          if (!updated) return reply.callNotFound()
          return reply.redirect(backTo, 303)
        },
      )

      app.post(
        checklistPath('items', locale, [':aircraftId', ':checklistId', ':itemId', 'move-up']),
        requireAuth,
        async (req, reply) => {
          const pilotId = (req.pilot as NonNullable<typeof req.pilot>).id
          const { aircraftId, checklistId, itemId } = req.params as {
            aircraftId: string
            checklistId: string
            itemId: string
          }
          await checklistRepo.moveItem(pilotId, checklistId, itemId, 'up')
          return reply.redirect(checklistItemsPath(locale, aircraftId, checklistId), 303)
        },
      )

      app.post(
        checklistPath('items', locale, [':aircraftId', ':checklistId', ':itemId', 'move-down']),
        requireAuth,
        async (req, reply) => {
          const pilotId = (req.pilot as NonNullable<typeof req.pilot>).id
          const { aircraftId, checklistId, itemId } = req.params as {
            aircraftId: string
            checklistId: string
            itemId: string
          }
          await checklistRepo.moveItem(pilotId, checklistId, itemId, 'down')
          return reply.redirect(checklistItemsPath(locale, aircraftId, checklistId), 303)
        },
      )

      app.post(
        checklistPath('items', locale, [':aircraftId', ':checklistId', ':itemId', 'delete']),
        requireAuth,
        async (req, reply) => {
          const pilotId = (req.pilot as NonNullable<typeof req.pilot>).id
          const { aircraftId, checklistId, itemId } = req.params as {
            aircraftId: string
            checklistId: string
            itemId: string
          }
          await checklistRepo.removeItem(pilotId, checklistId, itemId)
          return reply.redirect(checklistItemsPath(locale, aircraftId, checklistId), 303)
        },
      )

      function redirectWithError(
        reply: { redirect: (url: string, code: number) => unknown },
        backTo: string,
        errors: ChecklistFormErrors,
      ) {
        const key = errors.general ?? Object.values(errors)[0] ?? 'checklist.error.name_required'
        return reply.redirect(`${backTo}?error=${encodeURIComponent(key)}`, 303)
      }
    }
  },
}
