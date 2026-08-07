import type { Response as ExpressResponse } from 'express'
import { env } from '../config/env.js'
import { AppError } from './errors.js'
import { logger } from './logger.js'

export function joinUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
}

export async function requestProvider(path: string, apiKey: string, init: RequestInit) {
  const timeoutSignal = AbortSignal.timeout(env.AI_REQUEST_TIMEOUT_MS)
  const signal = init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal

  try {
    const response = await fetch(joinUrl(env.ARK_BASE_URL, path), {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...init.headers,
      },
      signal,
    })

    if (!response.ok) {
      const providerMessage = await response.text()
      logger.warn({ status: response.status, providerMessage }, 'AI provider request failed')
      throw createProviderError(response.status)
    }

    return response
  } catch (error) {
    if (error instanceof AppError) {
      throw error
    }

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new AppError(504, 'AI_PROVIDER_TIMEOUT', 'AI 服务响应超时，请稍后重试')
    }

    throw new AppError(502, 'AI_PROVIDER_UNREACHABLE', '无法连接 AI 服务，请稍后重试', error)
  }
}

function createProviderError(status: number) {
  if (status === 401 || status === 403) {
    return new AppError(503, 'AI_PROVIDER_AUTH_ERROR', 'AI 服务配置异常，请联系管理员')
  }

  if (status === 429) {
    return new AppError(503, 'AI_PROVIDER_BUSY', 'AI 服务当前繁忙，请稍后重试')
  }

  if (status === 400 || status === 404) {
    return new AppError(502, 'AI_PROVIDER_CONFIG_ERROR', 'AI 服务配置异常，请联系管理员')
  }

  return new AppError(502, 'AI_PROVIDER_ERROR', 'AI 服务暂时不可用，请稍后重试')
}

// Streams provider bytes directly to the browser, preserving SSE for low-latency text output.
export async function pipeProviderResponse(upstream: Response, response: ExpressResponse) {
  response.status(upstream.status)
  response.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-cache, no-transform')
  response.setHeader('X-Accel-Buffering', 'no')

  if (!upstream.body) {
    response.end()
    return
  }

  const reader = upstream.body.getReader()

  try {
    for (;;) {
      const { done, value } = await reader.read()

      if (done) {
        break
      }

      response.write(Buffer.from(value))
    }
  } finally {
    reader.releaseLock()
    response.end()
  }
}
