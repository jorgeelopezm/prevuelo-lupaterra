import type { EmbeddingProvider } from './types.js'

export interface EmbeddingProviderConfig {
  /** Provider name from configuration (`EMBEDDING_PROVIDER`). */
  provider: string
  /** Fixed vector dimensionality (`EMBEDDING_DIMENSIONS`). */
  dimensions: number
  /** Credential (`EMBEDDING_API_KEY`), required by every non-mock provider. */
  apiKey?: string
}

/** Startup-aborting configuration error; names the offending provider. */
export class EmbeddingProviderConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EmbeddingProviderConfigError'
  }
}

/**
 * Deterministic hash-derived mock provider. FNV-1a over the text seeds a
 * fixed PRNG, so the same text always yields the same vector (across calls
 * and processes) at the configured dimensionality, L2-normalized so cosine
 * similarity is a meaningful ranking signal.
 */
export function createMockEmbeddingProvider(dimensions: number): EmbeddingProvider {
  return {
    async embed(batch) {
      return batch.map((text) => deterministicEmbedding(text, dimensions))
    },
  }
}

/**
 * Select the embedding provider from configuration. The mock provider is the
 * default when no credential is configured; naming a non-mock provider without
 * its credential aborts startup with an error naming the credential. Real
 * provider adapters are deferred to the Documents capability, so only `mock`
 * is constructible today.
 */
export function createEmbeddingProvider(config: EmbeddingProviderConfig): EmbeddingProvider {
  if (config.provider === 'mock') return createMockEmbeddingProvider(config.dimensions)
  if (!config.apiKey) {
    throw new EmbeddingProviderConfigError(
      `Embedding provider '${config.provider}' requires EMBEDDING_API_KEY; refusing to start`,
    )
  }
  throw new EmbeddingProviderConfigError(
    `Embedding provider '${config.provider}' is not implemented yet; only 'mock' is available in this change`,
  )
}

/** FNV-1a 32-bit hash — stable across platforms and Node versions. */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** mulberry32 PRNG: deterministic sequence for a given seed. */
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function deterministicEmbedding(text: string, dimensions: number): number[] {
  const rand = mulberry32(fnv1a(text))
  const raw = new Array<number>(dimensions)
  let norm = 0
  for (let i = 0; i < dimensions; i++) {
    const value = rand() * 2 - 1
    raw[i] = value
    norm += value * value
  }
  const inv = norm > 0 ? 1 / Math.sqrt(norm) : 0
  return raw.map((value) => Number((value * inv).toFixed(6)))
}
