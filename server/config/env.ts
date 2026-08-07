import { z } from 'zod'

const optionalString = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().optional(),
)

const secretString = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value
  }

  // Render stores the raw key; tolerate copied quotes or an accidental "Bearer" prefix.
  const normalized = value.trim().replace(/^(['"])(.*)\1$/, '$2').replace(/^Bearer\s+/i, '').trim()
  return normalized || undefined
}, z.string().optional())

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://127.0.0.1:5173'),
  ARK_API_KEY: secretString,
  ARK_BASE_URL: z.string().url().default('https://ark.cn-beijing.volces.com/api/v3'),
  ARK_TEXT_MODEL: z.string().trim().default('doubao-seed-2-0-pro-260215'),
  ARK_TEXT_CHAT_PATH: z.string().trim().default('/chat/completions'),
  ARK_IMAGE_API_KEY: secretString,
  ARK_IMAGE_MODEL: optionalString,
  ARK_IMAGE_GENERATION_PATH: z.string().trim().default('/images/generations'),
  ARK_IMAGE_POLL_PATH: optionalString,
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(300_000).default(120_000),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('Invalid server environment:', z.treeifyError(parsed.error))
  process.exit(1)
}

export const env = parsed.data

export const corsOrigins = env.CORS_ORIGINS.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)
