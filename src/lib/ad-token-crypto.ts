import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const ALGO = 'aes-256-gcm'

function resolveKey(): Buffer {
  const explicit = process.env.AD_TOKEN_ENCRYPTION_KEY?.trim()
  if (explicit) {
    // Accept 32-byte hex or any passphrase (hashed to 32 bytes).
    if (/^[0-9a-fA-F]{64}$/.test(explicit)) return Buffer.from(explicit, 'hex')
    return createHash('sha256').update(explicit).digest()
  }
  const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (fallback) return createHash('sha256').update(`compass-ad-tokens:${fallback}`).digest()
  throw new Error('AD_TOKEN_ENCRYPTION_KEY or SUPABASE_SERVICE_ROLE_KEY required to store ad tokens')
}

/** Encrypt a secret for DB storage. Format: v1:<iv_b64>:<tag_b64>:<cipher_b64> */
export function encryptSecret(plaintext: string): string {
  const key = resolveKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`
}

export function decryptSecret(payload: string): string {
  const [version, ivB64, tagB64, dataB64] = payload.split(':')
  if (version !== 'v1' || !ivB64 || !tagB64 || !dataB64) {
    throw new Error('invalid_encrypted_secret')
  }
  const key = resolveKey()
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final()
  ]).toString('utf8')
}

export function maskToken(token: string | null | undefined): string | null {
  if (!token) return null
  if (token.length <= 8) return '••••'
  return `${token.slice(0, 4)}…${token.slice(-4)}`
}
