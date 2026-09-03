import { fileURLToPath } from 'node:url'

import type { FastifyRequest } from 'fastify'
import { Environment, FileSystemLoader } from 'nunjucks'

import { createTranslator, type Translator } from '../../platform/i18n/catalog.js'
import {
  formatDate,
  formatNumber,
  formatPercent,
  formatUtc,
  formatUtcDateTime,
} from '../../platform/i18n/format.js'
import { SUPPORTED_LOCALES, type SupportedLocale } from '../../platform/i18n/locale.js'
import { destinationPath, type ModuleId } from '../../platform/i18n/segments.js'
import { switchLocalePath } from '../../platform/i18n/switcher.js'
import type { PilotRecord } from '../../platform/identity/types.js'
import type { FeatureModule } from '../../modules/types.js'

export const VIEWS_DIR = fileURLToPath(new URL('../../views/', import.meta.url))

export interface RenderOptions {
  /**
   * The content partial for this route. It is rendered alone for `HX-Request`
   * fragments and embedded in the application layout for full-page responses —
   * the same partial, never two copies.
   */
  fragment: string
  /** Route-specific locals (title, activeNav, page data, …). */
  locals?: Record<string, unknown>
}

export interface ViewRenderer {
  render(req: FastifyRequest, opts: RenderOptions): string
}

/** Nunjucks filter functions receive the render context as `this.ctx` (the
 * compiled template calls filters as `env.getFilter(name).call(context, ...)`,
 * where `context` is the runtime `Context` instance, and `Context` stores the
 * plain object passed to `render()` on `.ctx`, not `.context`). */
type FilterThis = { ctx: Record<string, unknown> }

function createNunjucksEnvironment(): Environment {
  const env = new Environment(new FileSystemLoader(VIEWS_DIR), {
    autoescape: true,
    throwOnUndefined: false,
    trimBlocks: true,
    lstripBlocks: true,
  })

  // Translation and formatting helpers as filters. `this.ctx` carries the
  // per-request translator + locale that the shell context builds.
  env.addFilter('translate', function (this: FilterThis, key: string): string {
    return (this.ctx.t as Translator).translate(String(key))
  })
  env.addFilter('translateArray', function (this: FilterThis, key: string): string[] {
    return (this.ctx.t as Translator).translateArray(String(key))
  })
  env.addFilter('intlNumber', function (this: FilterThis, value: number): string {
    return formatNumber(Number(value), this.ctx.locale as SupportedLocale)
  })
  env.addFilter('intlPercent', function (this: FilterThis, value: number): string {
    return formatPercent(Number(value), this.ctx.locale as SupportedLocale)
  })
  env.addFilter('intlDate', function (this: FilterThis, value: Date | string): string {
    return formatDate(new Date(value), this.ctx.locale as SupportedLocale)
  })
  env.addFilter('intlUtc', function (this: FilterThis, value: Date | string): string {
    return formatUtc(new Date(value), this.ctx.locale as SupportedLocale)
  })
  env.addFilter('intlUtcDateTime', function (this: FilterThis, value: Date | string): string {
    return formatUtcDateTime(new Date(value), this.ctx.locale as SupportedLocale)
  })

  return env
}

export interface ShellContext {
  t: Translator
  locale: SupportedLocale
  lang: SupportedLocale
  /** Request-scoped shell data passed explicitly to macros (macros cannot see
   * the render context). */
  shell: {
    t: Translator
    locale: SupportedLocale
    isAuthenticated: boolean
    pilot: PilotRecord | null
    pilotInitials: string
    switcherLinks: Array<{ code: string; href: string; active: boolean }>
  }
  isAuthenticated: boolean
  pilot: PilotRecord | null
  pilotInitials: string
  csrfToken: string
  destinations: Array<{
    id: ModuleId
    label: string
    href: string
    icon: string
    active: boolean
  }>
  switcherLinks: Array<{ code: string; href: string; active: boolean }>
  currentPath: string
}

function initialsOf(displayName: string): string {
  return displayName
    .split(/\s+/)
    .map((word) => word[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export function createViewRenderer(modules: readonly FeatureModule[]): ViewRenderer {
  const env = createNunjucksEnvironment()

  return {
    render(req, opts) {
      const locale = req.locale
      const t = createTranslator({ locale })
      const currentPath = (req.url.split('?')[0] ?? '/') || '/'
      const switcherLinks = SUPPORTED_LOCALES.map((code) => ({
        code,
        href: switchLocalePath({ from: locale, to: code, currentPath }),
        active: code === locale,
      }))
      const pilotInitials = req.pilot ? initialsOf(req.pilot.displayName) : ''

      const context: ShellContext & Record<string, unknown> = {
        t,
        locale,
        lang: locale,
        shell: {
          t,
          locale,
          isAuthenticated: req.isAuthenticated,
          pilot: req.pilot,
          pilotInitials,
          switcherLinks,
        },
        isAuthenticated: req.isAuthenticated,
        pilot: req.pilot,
        pilotInitials,
        csrfToken: req.csrfToken,
        currentPath,
        destinations: modules.map((mod) => ({
          id: mod.id,
          label: t.translate(mod.labelKey),
          href: destinationPath(mod.id, locale),
          icon: mod.icon,
          active: false,
        })),
        switcherLinks,
        ...(opts.locals ?? {}),
      }

      // The requested page's active destination (locals may set it).
      const activeId = opts.locals?.activeNav as ModuleId | undefined
      if (activeId) {
        for (const dest of context.destinations) {
          dest.active = dest.id === activeId
        }
      }

      const isFragment = req.headers['hx-request'] === 'true'
      const fragmentHtml = env.render(opts.fragment, context)
      if (isFragment) return fragmentHtml
      return env.render('layout.njk', { ...context, content: fragmentHtml })
    },
  }
}
