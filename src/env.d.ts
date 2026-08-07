/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly [key: string]: string | undefined
  readonly VITE_API_BASE_URL?: string
  readonly VITE_USE_REAL_AI?: string
  readonly VITE_ENABLE_REAL_IMAGE?: string
  readonly VITE_AI_TEXT_RESPONSE_FORMAT_ENABLED?: string
  readonly VITE_AI_MAX_CONCURRENCY?: string
  readonly VITE_AI_RETRY_COUNT?: string
  readonly VITE_AI_RETRY_BASE_DELAY_MS?: string
  readonly VITE_AI_REQUEST_TIMEOUT_MS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
