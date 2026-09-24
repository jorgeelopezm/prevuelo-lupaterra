import { AvwxWeatherProvider } from './avwx.js'
import { AwcWeatherProvider } from './awc.js'
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
 * provider (https://avwx.rest/api); `awc` is the keyless aviationweather.gov
 * Data API (no NOTAMs — see `createProviders`). `aemet`/`ipma`/`ead` are named
 * but not yet implemented: `aemet` without its key aborts naming that key
 * (config validation already does the same for `ipma`/`ead`), and each of
 * them aborts as not-yet-implemented under its own name (config validation and
 * provider construction are deliberately separate failure points).
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

  if (config.provider === 'awc') return new AwcWeatherProvider()

  if (config.provider === 'aemet' && !config.aemetApiKey) {
    throw new WeatherProviderConfigError(
      `Weather provider 'aemet' requires AEMET_OPENDATA_API_KEY; refusing to start`,
    )
  }
  throw new WeatherProviderConfigError(
    `Weather provider '${config.provider}' is not implemented yet; only 'mock', 'avwx', and 'awc' are available`,
  )
}

export interface ProvidersConfig extends WeatherProviderConfig {
  /** Resolved NOTAM provider (`resolveNotamProvider`); `null` when none applies. */
  notamProvider: string | null
}

/** The weather provider plus the NOTAM provider, which may be the same instance. */
export interface WeatherProviders {
  weather: WeatherProvider
  notams: WeatherProvider
}

/**
 * Build both providers. When the NOTAM provider is the weather provider, one
 * instance serves both (one rate budget, as before). A weather provider that
 * supplies no NOTAMs with no NOTAM provider aborts naming `NOTAM_PROVIDER` —
 * config validation normally catches this first.
 */
export function createProviders(config: ProvidersConfig): WeatherProviders {
  const weather = createWeatherProvider(config)
  if (config.notamProvider === null) {
    throw new WeatherProviderConfigError(
      `Weather provider '${config.provider}' supplies no NOTAMs; NOTAM_PROVIDER must be set`,
    )
  }
  const notams =
    config.notamProvider === weather.id
      ? weather
      : createWeatherProvider({ ...config, provider: config.notamProvider })
  return { weather, notams }
}
