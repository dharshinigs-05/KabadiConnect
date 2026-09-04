import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  DATABASE_URL: z.string().min(1).optional(),
  ML_SERVICE_URL: z.string().url().default('http://localhost:8000'),
  USE_MOCK_ML: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),
  DEFAULT_DEMO_REGION: z.string().min(1).default('demo-region'),
  CORS_ORIGIN: z.string().default('*'),
  STORAGE_BUCKET_LOTS: z.string().default('lot-photos'),
  STORAGE_BUCKET_TRACE: z.string().default('trace-photos'),
  STORAGE_BUCKET_SAFETY: z.string().default('safety-assets'),
  USE_MOCK_AUTH: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),
  MOCK_OTP: z.string().default('123456'),
  SIGNED_URL_EXPIRY_SECONDS: z.coerce.number().default(3600),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  return parsed.data;
}

export const env = loadEnv();

export function isProduction(): boolean {
  return env.NODE_ENV === 'production';
}

export function useMockMl(): boolean {
  return env.USE_MOCK_ML || !env.ML_SERVICE_URL;
}

export function useMockAuth(): boolean {
  const mock = env.USE_MOCK_AUTH || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY;
  if (mock && env.NODE_ENV === 'production') {
    throw new Error(
      'FATAL: USE_MOCK_AUTH is enabled but NODE_ENV=production. ' +
      'Set USE_MOCK_AUTH=false and provide real Supabase credentials.'
    );
  }
  return mock;
}
