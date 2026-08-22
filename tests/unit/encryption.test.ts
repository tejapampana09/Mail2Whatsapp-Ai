import { test, describe } from 'node:test';
import assert from 'node:assert';
import crypto from 'crypto';
import { encryptText, decryptText } from '../../db';
import { env } from '../../config/env.config';

describe('Database AES-256-GCM Encryption & Migration Tests', () => {
  test('encryptText produces v2 format with authentication tag', () => {
    const plaintext = 'sensitive_google_refresh_token_12345';
    const encrypted = encryptText(plaintext);

    assert.strictEqual(encrypted.startsWith('v2:'), true);
    const parts = encrypted.split(':');
    assert.strictEqual(parts.length, 4); // ['v2', ivHex, tagHex, cipherHex]
    assert.strictEqual(parts[1].length, 24); // 12 bytes IV = 24 hex chars
    assert.strictEqual(parts[2].length, 32); // 16 bytes Tag = 32 hex chars
  });

  test('decryptText correctly decrypts v2 AES-256-GCM ciphertext', () => {
    const secret = 'user_access_token_super_confidential_987654';
    const encrypted = encryptText(secret);
    const decrypted = decryptText(encrypted);
    assert.strictEqual(decrypted, secret);
  });

  test('decryptText throws error when authentication tag is tampered', () => {
    const plaintext = 'original_secret';
    const encrypted = encryptText(plaintext);
    const parts = encrypted.split(':');
    
    // Deterministically modify tag (flip first hex character)
    const firstChar = parts[2][0];
    const replacementChar = firstChar === 'a' ? 'b' : 'a';
    const tamperedTag = replacementChar + parts[2].substring(1);
    const tamperedCiphertext = `v2:${parts[1]}:${tamperedTag}:${parts[3]}`;

    assert.throws(() => {
      decryptText(tamperedCiphertext);
    });
  });

  test('decryptText throws error when ciphertext is tampered (Bit-flipping protection)', () => {
    const plaintext = 'original_secret';
    const encrypted = encryptText(plaintext);
    const parts = encrypted.split(':');
    
    // Deterministically modify ciphertext (flip first hex character)
    const firstChar = parts[3][0];
    const replacementChar = firstChar === 'a' ? 'b' : 'a';
    const tamperedPayload = replacementChar + parts[3].substring(1);
    const tamperedCiphertext = `v2:${parts[1]}:${parts[2]}:${tamperedPayload}`;

    assert.throws(() => {
      decryptText(tamperedCiphertext);
    });
  });

  test('decryptText backward compatibility: decrypts legacy CBC format safely', () => {
    // Generate legacy AES-256-CBC ciphertext using env.JWT_SECRET
    const legacySecret = env.JWT_SECRET;
    const key = crypto.createHash('sha256').update(legacySecret).digest();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let legacyEncrypted = cipher.update('legacy_refresh_token_data', 'utf8', 'hex');
    legacyEncrypted += cipher.final('hex');
    const legacyString = iv.toString('hex') + ':' + legacyEncrypted;

    // Decrypt using our unified decryptText
    const decrypted = decryptText(legacyString);
    assert.strictEqual(decrypted, 'legacy_refresh_token_data');
  });
});
