/**
 * pgvector literal helpers. The driver hands vectors across as text
 * (`[0.1,0.2,…]`), so every repository boundary converts explicitly.
 */

export function toVectorLiteral(vector: readonly number[]): string {
  return `[${vector.map((value) => Number(value)).join(',')}]`
}

export function parseVectorLiteral(literal: string | null): number[] | null {
  if (!literal) return null
  const trimmed = literal.trim()
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return null
  const body = trimmed.slice(1, -1)
  if (body.trim() === '') return []
  return body.split(',').map((part) => Number(part))
}
