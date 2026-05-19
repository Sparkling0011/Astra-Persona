/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly [key: string]: string | undefined
  readonly VITE_USE_REAL_AI?: string
  readonly VITE_AI_TEXT_PROVIDER?: string
  readonly VITE_AI_TEXT_API_KEY?: string
  readonly VITE_AI_TEXT_BASE_URL?: string
  readonly VITE_AI_TEXT_MODEL?: string
  readonly VITE_AI_TEXT_CHAT_PATH?: string
  readonly VITE_AI_TEXT_RESPONSE_FORMAT_ENABLED?: string
  readonly VITE_AI_IMAGE_PROVIDER?: string
  readonly VITE_AI_IMAGE_API_KEY?: string
  readonly VITE_AI_IMAGE_BASE_URL?: string
  readonly VITE_AI_IMAGE_MODEL?: string
  readonly VITE_AI_IMAGE_GENERATION_PATH?: string
  readonly VITE_AI_IMAGE_EDIT_PATH?: string
  readonly VITE_AI_IMAGE_POLL_PATH?: string
  readonly VITE_AI_MAX_CONCURRENCY?: string
  readonly VITE_AI_RETRY_COUNT?: string
  readonly VITE_AI_RETRY_BASE_DELAY_MS?: string
  readonly VITE_AI_REQUEST_TIMEOUT_MS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
