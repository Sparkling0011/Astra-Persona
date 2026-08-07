import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { env } from '../config/env.js'
import { AppError } from '../lib/errors.js'
import { pipeProviderResponse, requestProvider } from '../lib/provider.js'

const messageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string().min(1).max(30_000),
})

const textGenerationSchema = z.object({
  messages: z.array(messageSchema).min(1).max(30),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().min(1).max(8_192).optional(),
  stream: z.boolean().optional(),
  response_format: z.object({ type: z.literal('json_object') }).optional(),
})

const imageGenerationSchema = z.object({
  prompt: z.string().min(1).max(8_000),
  n: z.number().int().min(1).max(8).default(1),
  size: z.string().regex(/^\d{2,5}x\d{2,5}$/).default('1024x1024'),
  response_format: z.enum(['url', 'b64_json']).default('url'),
})

const taskIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,160}$/)

export const aiRouter = Router()

aiRouter.post('/text', async (request, response, next) => {
  try {
    const body = parseBody(textGenerationSchema, request.body)
    const apiKey = requireTextApiKey()
    const clientSignal = createClientSignal(request, response)
    const upstream = await requestProvider(env.ARK_TEXT_CHAT_PATH, apiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, model: env.ARK_TEXT_MODEL }),
      signal: clientSignal,
    })

    await pipeProviderResponse(upstream, response)
  } catch (error) {
    next(error)
  }
})

aiRouter.post('/image', async (request, response, next) => {
  try {
    const body = parseBody(imageGenerationSchema, request.body)
    const { apiKey, model } = requireImageConfig()
    const clientSignal = createClientSignal(request, response)
    const upstream = await requestProvider(env.ARK_IMAGE_GENERATION_PATH, apiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, model }),
      signal: clientSignal,
    })

    await pipeProviderResponse(upstream, response)
  } catch (error) {
    next(error)
  }
})

aiRouter.get('/image/tasks/:taskId', async (request, response, next) => {
  try {
    if (!env.ARK_IMAGE_POLL_PATH) {
      throw new AppError(503, 'IMAGE_POLL_NOT_CONFIGURED', '图像任务轮询服务尚未配置')
    }

    const taskId = taskIdSchema.parse(request.params.taskId)
    const { apiKey } = requireImageConfig()
    const path = env.ARK_IMAGE_POLL_PATH.replace(':taskId', encodeURIComponent(taskId))
    const upstream = await requestProvider(path, apiKey, {
      method: 'GET',
      signal: createClientSignal(request, response),
    })

    await pipeProviderResponse(upstream, response)
  } catch (error) {
    next(normalizeValidationError(error))
  }
})

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body)

  if (!result.success) {
    throw new AppError(400, 'INVALID_REQUEST', '请求参数不合法', z.treeifyError(result.error))
  }

  return result.data
}

function requireTextApiKey() {
  if (!env.ARK_API_KEY) {
    throw new AppError(503, 'TEXT_AI_NOT_CONFIGURED', '文本生成服务尚未配置')
  }

  return env.ARK_API_KEY
}

function requireImageConfig() {
  const apiKey = env.ARK_IMAGE_API_KEY ?? env.ARK_API_KEY

  if (!apiKey || !env.ARK_IMAGE_MODEL) {
    throw new AppError(503, 'IMAGE_AI_NOT_CONFIGURED', '图像生成服务尚未配置')
  }

  return { apiKey, model: env.ARK_IMAGE_MODEL }
}

function normalizeValidationError(error: unknown) {
  return error instanceof z.ZodError
    ? new AppError(400, 'INVALID_REQUEST', '请求参数不合法', z.treeifyError(error))
    : error
}

function createClientSignal(request: Request, response: Response) {
  const controller = new AbortController()
  request.once('aborted', () => controller.abort())
  response.once('close', () => {
    if (!response.writableEnded) {
      controller.abort()
    }
  })
  return controller.signal
}
