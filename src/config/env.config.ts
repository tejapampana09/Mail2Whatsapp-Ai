import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const isTestOrCI = process.env.NODE_ENV === 'test' || !!process.env.CI || process.env.npm_lifecycle_event === 'test';

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  DATABASE_PATH: z.string().default('mail2whatsapp.db'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters for security.'),
  DB_ENCRYPTION_KEY: z.string().min(32, 'DB_ENCRYPTION_KEY must be at least 32 characters for AES-256 security.'),

  // LLM Provider Configurations
  LLM_PROVIDER: z.enum(['google', 'gemini', 'openrouter', 'openai']).default('google'),
  LLM_API_KEY: z.string().min(1, 'LLM_API_KEY is required.'),
  LLM_MODEL: z.string().default('gemini-2.5-flash'),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),

  // Google OAuth Credentials
  GOOGLE_CLIENT_ID: z.string().min(1, 'GOOGLE_CLIENT_ID is required.'),
  GOOGLE_CLIENT_SECRET: z.string().min(1, 'GOOGLE_CLIENT_SECRET is required.'),
  GOOGLE_REDIRECT_URI: z.string().url('GOOGLE_REDIRECT_URI must be a valid URL.'),

  // WhatsApp Meta Cloud API
  WHATSAPP_ACCESS_TOKEN: z.string().min(1, 'WHATSAPP_ACCESS_TOKEN is required.'),
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1, 'WHATSAPP_PHONE_NUMBER_ID is required.'),
  META_APP_SECRET: z.string().optional(),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().default('mail2whatsapp_secure_webhook_token_2026'),
  WHATSAPP_TEMPLATE_NAME: z.string().optional(),
  WHATSAPP_TEMPLATE_LANG: z.string().default('en'),
  WHATSAPP_DIGEST_TEMPLATE_NAME: z.string().optional(),
  WHATSAPP_DIGEST_TEMPLATE_LANG: z.string().default('en'),
  WHATSAPP_VOICE_ENABLED: z.string().default('false'),
  TTS_PROVIDER: z.enum(['none', 'openai', 'google']).default('none'),

  // WhatsApp Outbox Worker & Retry Configurations
  WHATSAPP_MAX_RETRIES: z.coerce.number().default(6),
  WHATSAPP_BATCH_SIZE: z.coerce.number().default(10),
  WHATSAPP_POLL_INTERVAL_MS: z.coerce.number().default(5000),
  WHATSAPP_STALE_TIMEOUT_MS: z.coerce.number().default(180000),

  // Google Pub/Sub Webhook Security (Cryptographic OIDC JWT Only)
  PUBSUB_AUDIENCE: z.string().trim().url('PUBSUB_AUDIENCE must be a valid URL.').optional(),
  PUBSUB_SERVICE_ACCOUNT: z.string().trim().email('PUBSUB_SERVICE_ACCOUNT must be a valid service-account email.').optional(),

  // Network & Reverse Proxy Topologies
  TRUST_PROXY: z.string().default('false'),

  // Redis Queue Configurations (Optional, gracefully falls back)
  REDIS_URL: z.string().optional(),
  REDIS_HOST: z.string().default('127.0.0.1'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),

  // CORS Origins
  CORS_ORIGINS: z.string().optional()
});

function parseEnvironment() {
  if (isTestOrCI) {
    return envSchema.parse({
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_PATH: ':memory:',
      JWT_SECRET: process.env.JWT_SECRET || 'test_jwt_secret_minimum_16_characters_2026',
      DB_ENCRYPTION_KEY: process.env.DB_ENCRYPTION_KEY || 'test_db_encryption_key_minimum_32_characters_long_2026',
      LLM_API_KEY: process.env.LLM_API_KEY || 'test_mock_llm_api_key_2026',
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || 'test_google_client_id.apps.googleusercontent.com',
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || 'test_google_client_secret',
      GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/google/callback',
      WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN || 'test_whatsapp_access_token_2026',
      WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID || '123456789012345',
      META_APP_SECRET: process.env.META_APP_SECRET || 'test_meta_app_secret_2026',
      PUBSUB_AUDIENCE: process.env.PUBSUB_AUDIENCE,
      PUBSUB_SERVICE_ACCOUNT: process.env.PUBSUB_SERVICE_ACCOUNT
    });
  }

  if (process.env.NODE_ENV === 'production') {
    const missingProductionPubSub = [
      !process.env.PUBSUB_AUDIENCE?.trim() ? 'PUBSUB_AUDIENCE' : null,
      !process.env.PUBSUB_SERVICE_ACCOUNT?.trim() ? 'PUBSUB_SERVICE_ACCOUNT' : null
    ].filter(Boolean) as string[];

    if (missingProductionPubSub.length > 0) {
      throw new Error(`Production startup refused: ${missingProductionPubSub.join(', ')} must be explicitly configured.`);
    }
  }

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.warn('⚠️ Environment variable warning during parsing:');
    for (const issue of result.error.issues) {
      console.warn(' - ' + issue.path.join('.') + ': ' + issue.message);
    }
    return envSchema.parse({
      ...process.env,
      JWT_SECRET: process.env.JWT_SECRET || 'dev_secret_fallback_minimum_16_characters_key_2026',
      DB_ENCRYPTION_KEY: process.env.DB_ENCRYPTION_KEY || 'dev_encryption_key_minimum_32_characters_long_2026',
      LLM_API_KEY: process.env.LLM_API_KEY || 'missing_llm_key',
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || 'missing_google_id',
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || 'missing_google_secret',
      GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/google/callback',
      WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN || 'missing_whatsapp_token',
      WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID || 'missing_phone_id',
      PUBSUB_AUDIENCE: process.env.PUBSUB_AUDIENCE,
      PUBSUB_SERVICE_ACCOUNT: process.env.PUBSUB_SERVICE_ACCOUNT
    });
  }
  return result.data;
}

export const env = parseEnvironment();
export type EnvironmentConfig = z.infer<typeof envSchema>;
