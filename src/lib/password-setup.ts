export function parsePasswordSetup(value: unknown): { tokenHash: string; password: string } {
  const input = value as { tokenHash?: unknown; password?: unknown } | null
  if (!input || typeof input.tokenHash !== 'string' || !/^(?:[a-f0-9]{56}|[a-f0-9]{64})$/i.test(input.tokenHash) || typeof input.password !== 'string' || input.password.length < 12 || input.password.length > 200) {
    throw new Error('Use the private setup link and a password of at least 12 characters.')
  }
  return { tokenHash: input.tokenHash, password: input.password }
}
