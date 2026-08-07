import { Router } from 'express'
import { env } from '../config/env.js'

export const healthRouter = Router()

healthRouter.get('/', (_request, response) => {
  response.json({
    status: 'ok',
    service: 'astra-persona-api',
    version: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? 'local',
    timestamp: new Date().toISOString(),
    capabilities: {
      textGeneration: Boolean(env.ARK_API_KEY && env.ARK_TEXT_MODEL),
      imageGeneration: Boolean((env.ARK_IMAGE_API_KEY ?? env.ARK_API_KEY) && env.ARK_IMAGE_MODEL),
    },
  })
})
