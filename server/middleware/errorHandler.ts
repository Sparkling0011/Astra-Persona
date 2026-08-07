import type { ErrorRequestHandler, RequestHandler } from 'express'
import { AppError } from '../lib/errors.js'
import { logger } from '../lib/logger.js'

export const notFoundHandler: RequestHandler = (request, _response, next) => {
  next(new AppError(404, 'ROUTE_NOT_FOUND', `接口不存在：${request.method} ${request.path}`))
}

export const errorHandler: ErrorRequestHandler = (error: unknown, request, response, _next) => {
  const appError = error instanceof AppError
    ? error
    : new AppError(500, 'INTERNAL_SERVER_ERROR', '服务器内部错误')

  logger.error(
    {
      err: error,
      requestId: request.id,
      method: request.method,
      path: request.path,
    },
    'Request failed',
  )

  response.status(appError.statusCode).json({
    error: {
      code: appError.code,
      message: appError.message,
      requestId: request.id,
    },
  })
}
