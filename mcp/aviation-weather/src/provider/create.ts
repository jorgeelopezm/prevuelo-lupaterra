import { createMockWeatherProvider } from './mock.js'
import type { WeatherProvider } from './types.js'

export interface WeatherProviderConfig {
  /** Provider name from configuration (`WEATHER_PROVIDER`). */
  provider: string
  /** Credential (`AEMET_OPENDATA_API_KEY`), required by non-mock providers. */
  aemetApiKey?: string
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
 * default when no credential is configured; naming a non-mock provider without
 * its credential aborts startup with an error naming the provider and the
 * missing credential. Real network adapters are deferred to the weather
 * capability, so only `mock` is constructible in this change.
 */
export function createWeatherProvider(config: WeatherProviderConfig): WeatherProvider {
  if (config.provider === 'mock') return createMockWeatherProvider()
  if (!config.aemetApiKey) {
    throw new WeatherProviderConfigError(
      `Weather provider '${config.provider}' requires AEMET_OPENDATA_API_KEY; refusing to start`,
    )
  }
  throw new WeatherProviderConfigError(
    `Weather provider '${config.provider}' is not implemented yet; only 'mock' is available in this change`,
  )
}
