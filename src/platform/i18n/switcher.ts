import { isSupportedLocale, type SupportedLocale } from './locale.js'
import { moduleForSegment, pathSegment, type ModuleId } from './segments.js'

export interface LocalePreferenceStore {
  get(pilotId: string): Promise<string | null>
  set(pilotId: string, locale: SupportedLocale): Promise<void>
}

/** No-op store used for anonymous visitors (session-only, no database write). */
export const NOOP_STORE: LocalePreferenceStore = {
  get: async () => null,
  set: async () => undefined,
}

export interface SwitchPathInput {
  /** The locale of the current route (the leading path segment). */
  from: SupportedLocale
  /** The locale the pilot selected. */
  to: SupportedLocale
  /** The current path, e.g. `/es/meteorologia` or `/es`. */
  currentPath: string
  /** Extra trailing segments (route parameters/IDs) to preserve verbatim. */
  tail?: readonly string[]
}

/**
 * Build the equivalent route in a target locale. The leading locale segment is
 * replaced; a following segment that names a known feature destination is
 * translated to that destination's segment in the target locale; unknown
 * trailing segments (route parameters) are preserved verbatim.
 */
export function switchLocalePath(input: SwitchPathInput): string {
  const { from, to, currentPath, tail = [] } = input
  const segments = currentPath.split('/').filter((seg) => seg.length > 0)

  const out: string[] = [to]

  let cursor = 0
  // The leading segment is normally the current locale (`from`); tolerate
  // another supported locale or an absent locale gracefully.
  if (
    segments[0] !== undefined &&
    (segments[0] === from || isSupportedLocale(segments[0] as string))
  ) {
    cursor = 1
  }

  const featureSegment = segments[cursor]
  const feature: ModuleId | undefined = featureSegment
    ? moduleForSegment(featureSegment)
    : undefined
  if (feature) {
    out.push(pathSegment(feature, to))
    cursor += 1
  }

  for (const seg of segments.slice(cursor)) out.push(seg)
  for (const seg of tail) out.push(seg)

  return '/' + out.join('/')
}

export interface LocaleSwitchInput extends SwitchPathInput {
  /** Persist the choice when the pilot is authenticated. */
  store?: LocalePreferenceStore
  pilotId?: string
}

export interface LocaleSwitchResult {
  targetPath: string
  persisted: boolean
}

/**
 * Drive a locale switch from the application shell: build the equivalent route
 * in the target locale and, when the pilot is authenticated, persist the choice
 * to their account. Anonymous visitors get no database write (session-only).
 */
export async function switchLocale(input: LocaleSwitchInput): Promise<LocaleSwitchResult> {
  const targetPath = switchLocalePath(input)
  const store = input.store ?? NOOP_STORE
  let persisted = false
  if (input.pilotId) {
    await store.set(input.pilotId, input.to)
    persisted = true
  }
  return { targetPath, persisted }
}
