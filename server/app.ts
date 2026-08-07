import { randomUUID } from 'node:crypto'
import cors from 'cors'
import express from 'express'
import { rateLimit } from 'express-rate-limit'
import helmet from 'helmet'
import { pinoHttp } from 'pino-http'
import { corsOrigins } from './config/env.js'
import { AppError } from './lib/errors.js'
import { logger } from './lib/logger.js'
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js'
import { aiRouter } from './routes/ai.js'
import { healthRouter } from './routes/health.js'

export function createApp() {
  const app = express()

  app.disable('x-powered-by')
  app.set('trust proxy', 1)
  app.use(
    pinoHttp({
      logger,
      genReqId: (request, response) => {
        const headerId = request.headers['x-request-id']
        const requestId = typeof headerId === 'string' ? headerId : randomUUID()
        response.setHeader('X-Request-Id', requestId)
        return requestId
      },
    }),
  )
  app.use(helmet())
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || corsOrigins.includes(origin)) {
          callback(null, true)
          return
        }

        callback(new AppError(403, 'CORS_ORIGIN_DENIED', '当前来源无权访问此服务'))
      },
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'X-Request-Id'],
    }),
  )
  app.use(express.json({ limit: '1mb' }))
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1_000,
      limit: 240,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: { code: 'RATE_LIMITED', message: '请求过于频繁，请稍后重试' } },
    }),
  )

  app.use('/api/health', healthRouter)
  app.use(
    '/api/ai',
    rateLimit({
      windowMs: 15 * 60 * 1_000,
      limit: 60,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      skip: (request) => request.method === 'GET',
      message: { error: { code: 'AI_RATE_LIMITED', message: 'AI 生成请求过于频繁，请稍后重试' } },
    }),
    aiRouter,
  )
  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
