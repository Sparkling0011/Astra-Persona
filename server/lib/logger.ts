import pino from 'pino'

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: [
      'req.headers.authorization',
      'headers.authorization',
      'ARK_API_KEY',
      'ARK_IMAGE_API_KEY',
      '*.apiKey',
    ],
    censor: '[REDACTED]',
  },
})
