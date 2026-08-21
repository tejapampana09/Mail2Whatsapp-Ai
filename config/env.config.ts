import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  DATABASE_PATH: z.string().default('mail2whatsapp.db'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters for security.'),

  // LLM Provider Configurations
  LLM_PROVIDER: z.enum(['google', 'gemini', 'openrouter', 'openai']).default('google'),
  LLM_API_KEY: z.string().min(1, 'LLM_API_KEY is required.'),
  LLM_MODEL: z.string().default('gemini-flash-latest'),
  OPENROUTER_API_KEY: z.string().optional(),

  // Google OAuth Credentials
  GOOGLE_CLIENT_ID: z.string().min(1, 'GOOGLE_CLIENT_ID is required.'),
  GOOGLE_CLIENT_SECRET: z.string().min(1, 'GOOGLE_CLIENT_SECRET is required.'),
  GOOGLE_REDIRECT_URI: z.string().url('GOOGLE_REDIRECT_URI must be a valid URL.'),

  // WhatsApp Meta Cloud API
  WHATSAPP_ACCESS_TOKEN: z.string().min(1, 'WHATSAPP_ACCESS_TOKEN is required.'),
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1, 'WHATSAPP_PHONE_NUMBER_ID is required.'),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().default('mail2whatsapp_secure_webhook_token_2026'),
  WHATSAPP_TEMPLATE_NAME: z.string().optional(),
  WHATSAPP_TEMPLATE_LANG: z.string().default('en'),
  WHATSAPP_DIGEST_TEMPLATE_NAME: z.string().optional(),
  WHATSAPP_DIGEST_TEMPLATE_LANG: z.string().default('en'),
  WHATSAPP_VOICE_ENABLED: z.string().default('true'),

  // Redis Queue Configurations (Optional, gracefully falls back)
  REDIS_URL: z.string().optional(),
  REDIS_HOST: z.string().default('127.0.0.1'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),

  // CORS Origins
  CORS_ORIGINS: z.string().optional()
});

function parseEnvironment() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('CRITICAL: Environment variable validation failed:');
    for (const issue of result.error.issues) {
      console.error(' - ' + issue.path.join('.') + ': ' + issue.message);
    }
    // Fail fast in production
    if (process.env.NODE_ENV === 'production' && !process.env.SKIP_ENV_VALIDATION) {
      process.exit(1);
    }
    return envSchema.parse({
      ...process.env,
      JWT_SECRET: process.env.JWT_SECRET || 'dev_secret_fallback_minimum_16_characters_key_2026',
      LLM_API_KEY: process.env.LLM_API_KEY || 'missing_llm_key',
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || 'missing_google_id',
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || 'missing_google_secret',
      GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/google/callback',
      WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN || 'missing_whatsapp_token',
      WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID || 'missing_phone_id'
    });
  }
  return result.data;
}

export const env = parseEnvironment();
export type EnvironmentConfig = z.infer<typeof envSchema>;
