import crypto from 'crypto';
import { env } from '../config/env.config';

const GCM_ALGORITHM = 'aes-256-gcm';
const CBC_ALGORITHM = 'aes-256-cbc';

export function getEncryptionKey(): Buffer {
  const secret = env.DB_ENCRYPTION_KEY || env.JWT_SECRET;
  return crypto.createHash('sha256').update(secret).digest();
}

export function getLegacyEncryptionKey(): Buffer {
  return crypto.createHash('sha256').update(env.JWT_SECRET).digest();
}

export function encryptText(text: string): string {
  if (!text) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(GCM_ALGORITHM, getEncryptionKey(), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `v2:${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decryptText(encryptedText: string): string {
  if (!encryptedText) return '';

  // V2 Format: Authenticated AES-256-GCM (v2:iv:authTag:ciphertext)
  if (encryptedText.startsWith('v2:')) {
    try {
      const parts = encryptedText.split(':');
      if (parts.length !== 4) throw new Error('Malformed v2 ciphertext structure.');
      const [, ivHex, tagHex, cipherHex] = parts;
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(tagHex, 'hex');
      const decipher = crypto.createDecipheriv(GCM_ALGORITHM, getEncryptionKey(), iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (err: any) {
      console.error('[Crypto] AES-256-GCM authentication/decryption failure:', err.message);
      throw new Error('Failed to authenticate and decrypt ciphertext.');
    }
  }

  // Legacy Format: AES-256-CBC with JWT_SECRET fallback for crash-safe rolling migration
  try {
    const parts = encryptedText.split(':');
    if (parts.length < 2) throw new Error('Malformed legacy ciphertext.');
    const iv = Buffer.from(parts.shift()!, 'hex');
    const encrypted = parts.join(':');
    const decipher = crypto.createDecipheriv(CBC_ALGORITHM, getLegacyEncryptionKey(), iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (legacyErr: any) {
    console.error('[Crypto] Legacy CBC decryption failure:', legacyErr.message);
    throw new Error('Failed to decrypt legacy ciphertext.');
  }
}
