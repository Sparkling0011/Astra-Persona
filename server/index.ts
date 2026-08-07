import { existsSync } from 'node:fs'

// Node 22 can load local secrets without adding a runtime dotenv dependency.
if (existsSync('server/.env')) {
  process.loadEnvFile('server/.env')
}

const [{ createApp }, { env }, { logger }] = await Promise.all([
  import('./app.js'),
  import('./config/env.js'),
  import('./lib/logger.js'),
])

const app = createApp()
const server = app.listen(env.PORT, '0.0.0.0', () => {
  logger.info({ port: env.PORT, environment: env.NODE_ENV }, 'Astra Persona API started')
})

function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down API server')
  server.close((error) => {
    if (error) {
      logger.error({ err: error }, 'API server shutdown failed')
      process.exit(1)
    }

    process.exit(0)
  })
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
