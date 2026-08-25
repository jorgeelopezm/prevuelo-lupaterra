import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  createEmbeddingProvider,
  createMockEmbeddingProvider,
  EmbeddingProviderConfigError,
} from './embeddings.js'

test('mock provider returns one vector per input, positionally', async () => {
  const provider = createMockEmbeddingProvider(4)
  const vectors = await provider.embed(['alpha', 'beta', 'gamma'])
  assert.equal(vectors.length, 3)
  const [single] = await provider.embed(['beta'])
  assert.deepEqual(vectors[1], single, 'position i of the batch equals embedding input i alone')
})

test('mock provider is deterministic across repeated calls', async () => {
  const provider = createMockEmbeddingProvider(8)
  const first = await provider.embed(['mismo texto'])
  const second = await provider.embed(['mismo texto'])
  assert.deepEqual(first, second, 'identical text yields identical vectors')
  assert.deepEqual(
    first,
    first.map((v) => v),
    'vectors are plain number arrays',
  )
})

test('mock vectors are fixed-dimensional and L2-normalized', async () => {
  const provider = createMockEmbeddingProvider(768)
  const vectors = await provider.embed(['texto'])
  assert.equal(vectors.length, 1)
  const vector = vectors[0]
  assert.ok(vector, 'one vector returned')
  assert.equal(vector.length, 768)
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0))
  assert.ok(Math.abs(norm - 1) < 1e-3, 'unit sphere so cosine similarity ranks')
})

test('mock is selected by default when no credential is configured', async () => {
  const provider = createEmbeddingProvider({ provider: 'mock', dimensions: 4 })
  const vectors = await provider.embed(['sin credencial'])
  assert.equal(vectors.length, 1)
  const vector = vectors[0]
  assert.ok(vector, 'one vector returned')
  assert.equal(vector.length, 4)
})

test('a named non-mock provider without its credential aborts startup naming it', () => {
  assert.throws(
    () => createEmbeddingProvider({ provider: 'openai', dimensions: 768 }),
    (error: unknown) => {
      assert.ok(error instanceof EmbeddingProviderConfigError)
      assert.match(error.message, /'openai'/)
      assert.match(error.message, /EMBEDDING_API_KEY/)
      return true
    },
  )
})

test('a named non-mock provider with its credential is refused as not implemented', () => {
  assert.throws(
    () => createEmbeddingProvider({ provider: 'local', dimensions: 768, apiKey: 'x' }),
    (error: unknown) => {
      assert.ok(error instanceof EmbeddingProviderConfigError)
      assert.match(error.message, /not implemented/)
      return true
    },
  )
})
