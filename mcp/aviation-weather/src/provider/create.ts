import { AvwxWeatherProvider } from './avwx.js'
import { createMockWeatherProvider } from './mock.js'
import type { WeatherProvider } from './types.js'

export interface WeatherProviderConfig {
  /** Provider name from configuration (`WEATHER_PROVIDER`). */
  provider: string
  /** Credential (`AEMET_OPENDATA_API_KEY`), required by the (still unimplemented) `aemet` provider. */
  aemetApiKey?: string
  /** Credential (`AVWX_API_TOKEN`), required by the `avwx` provider. */
  avwxApiToken?: string
}

/** Startup-aborting configuration error; names the offending provider. */
export class WeatherProviderConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WeatherProviderConfigError'
  }
}

/**
 * Select the weather provider from configuration. The mock provider is the
 * default when no credential is configured. `avwx` is a real, globally-scoped
 * provider (https://avwx.rest/api). `aemet`/`ipma`/`ead` are named but not yet
 * implemented; naming one without its credential aborts with that provider's
 * own missing-credential error, and naming one *with* its credential still
 * aborts as not-yet-implemented (config validation and provider construction
 * are deliberately separate failure points).
 */
export function createWeatherProvider(config: WeatherProviderConfig): WeatherProvider {
  if (config.provider === 'mock') return createMockWeatherProvider()

  if (config.provider === 'avwx') {
    if (!config.avwxApiToken) {
      throw new WeatherProviderConfigError(
        `Weather provider 'avwx' requires AVWX_API_TOKEN; refusing to start`,
      )
    }
    return new AvwxWeatherProvider({ apiToken: config.avwxApiToken })
  }

  if (!config.aemetApiKey) {
    throw new WeatherProviderConfigError(
      `Weather provider '${config.provider}' requires AEMET_OPENDATA_API_KEY; refusing to start`,
    )
  }
  throw new WeatherProviderConfigError(
    `Weather provider '${config.provider}' is not implemented yet; only 'mock' and 'avwx' are available in this change`,
  )
}
