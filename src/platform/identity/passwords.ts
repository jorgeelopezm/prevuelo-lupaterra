import { hash as argon2Hash, verify as argon2Verify } from '@node-rs/argon2'

/**
 * Password verifiers: Argon2id, a memory-hard algorithm. Only the verifier is
 * ever persisted, logged, or returned — plaintext passwords never are.
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2Hash(password)
}

export async function verifyPassword(verifier: string, password: string): Promise<boolean> {
  try {
    return await argon2Verify(verifier, password)
  } catch {
    // Malformed verifier rows are treated as non-matches, never as errors.
    return false
  }
}
