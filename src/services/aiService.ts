import type { AvatarVariant, PersonaBrand, PersonaForm, PersonaGenerationParams, PersonaStyle, PlatformBio } from '@/types/persona'
import { createId } from '@/utils/id'

type AIProvider = 'openai-compatible' | 'dashscope' | 'doubao' | 'deepseek' | 'siliconflow' | 'custom'
type AIJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
type ImageStatus = 'queued' | 'running' | 'succeeded' | 'failed'

interface AIBaseConfig {
  provider: AIProvider
  apiKey: string
  baseUrl: string
}

export interface TextModelConfig extends AIBaseConfig {
  model: string
  chatPath: string
  responseFormatEnabled: boolean
}

export interface ImageModelConfig extends AIBaseConfig {
  model: string
  generationPath: string
  editPath?: string
  pollPath?: string
}

export interface AIServiceConfig {
  text: TextModelConfig
  image: ImageModelConfig
  maxConcurrency: number
  retryCount: number
  retryBaseDelayMs: number
  requestTimeoutMs: number
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface TextGenerationOptions {
  messages: AIMessage[]
  temperature?: number
  maxTokens?: number
  responseFormat?: 'text' | 'json_object'
  signal?: AbortSignal
  onDelta?: (delta: string, fullText: string) => void
}

export interface ImageGenerationOptions {
  prompt: string
  count?: number
  size?: string
  signal?: AbortSignal
  onProgress?: (progress: ImageProgress) => void
}

export interface ImageInpaintingOptions {
  imageDataUrl: string
  maskDataUrl: string
  prompt: string
  size?: string
  signal?: AbortSignal
  onProgress?: (progress: ImageProgress) => void
}

export interface ImageProgress {
  status: ImageStatus
  progress: number
  message?: string
}

export interface PersonaTextIdentity {
  nickname: string
  username: string
  signature: string
  bio: string
  bios: PlatformBio[]
  tags: string[]
  imagePrompt: string
}

export interface CompletePersonaOptions {
  form: PersonaForm | PersonaGenerationParams
  signal?: AbortSignal
  onTextDelta?: TextGenerationOptions['onDelta']
  onImageProgress?: ImageGenerationOptions['onProgress']
}

export interface AIQueueJob<T> {
  id: string
  status: AIJobStatus
  promise: Promise<T>
  cancel: () => void
}

interface QueuedTask<T> {
  id: string
  controller: AbortController
  run: (signal: AbortSignal) => Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
  status: AIJobStatus
}

interface ChatCompletionChunk {
  choices?: Array<{
    delta?: {
      content?: string
    }
  }>
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
}

interface ImageItem {
  url?: string
  b64_json?: string
}

interface ImageGenerationResponse {
  data?: ImageItem[]
  images?: ImageItem[]
  output?: {
    task_id?: string
    task_status?: string
    results?: ImageItem[]
    images?: ImageItem[]
  }
  task_id?: string
  id?: string
  urls?: string[]
}

interface ImagePollResponse extends ImageGenerationResponse {
  status?: string
  progress?: number
}

export class AIServiceError extends Error {
  constructor(
    message: string,
    public readonly code: 'config' | 'network' | 'abort' | 'parse' | 'provider',
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'AIServiceError'
  }
}

export class AIQueue {
  private readonly queue: Array<QueuedTask<unknown>> = []
  private readonly jobs = new Map<string, QueuedTask<unknown>>()
  private runningCount = 0

  constructor(private readonly maxConcurrency = 2) {}

  // A tiny in-memory queue keeps duplicate user actions from flooding the AI provider.
  enqueue<T>(run: (signal: AbortSignal) => Promise<T>, externalSignal?: AbortSignal): AIQueueJob<T> {
    const id = createId('ai_job')
    const controller = new AbortController()

    if (externalSignal) {
      externalSignal.addEventListener('abort', () => controller.abort(), { once: true })
    }

    const promise = new Promise<T>((resolve, reject) => {
      const task: QueuedTask<T> = {
        id,
        controller,
        run,
        resolve,
        reject,
        status: 'queued',
      }

      this.queue.push(task as QueuedTask<unknown>)
      this.jobs.set(id, task as QueuedTask<unknown>)
      this.flush()
    })

    return {
      id,
      status: 'queued',
      promise,
      cancel: () => this.cancel(id),
    }
  }

  cancel(id: string) {
    const task = this.jobs.get(id)

    if (!task) {
      return
    }

    task.status = 'cancelled'
    task.controller.abort()
    task.reject(new AIServiceError('生成已取消', 'abort'))
    this.jobs.delete(id)
  }

  cancelAll() {
    for (const id of this.jobs.keys()) {
      this.cancel(id)
    }
  }

  private flush() {
    while (this.runningCount < this.maxConcurrency) {
      const task = this.queue.find((item) => item.status === 'queued')

      if (!task) {
        return
      }

      void this.runTask(task)
    }
  }

  private async runTask(task: QueuedTask<unknown>) {
    task.status = 'running'
    this.runningCount += 1

    try {
      const result = await task.run(task.controller.signal)
      task.status = 'completed'
      task.resolve(result)
    } catch (error) {
      task.status = task.controller.signal.aborted ? 'cancelled' : 'failed'
      task.reject(normalizeError(error))
    } finally {
      this.runningCount -= 1
      this.jobs.delete(task.id)
      this.flush()
    }
  }
}

export class AIService {
  private readonly queue: AIQueue

  constructor(private readonly config: AIServiceConfig = createAIConfigFromEnv()) {
    this.queue = new AIQueue(config.maxConcurrency)
  }

  enqueueTextGeneration(options: TextGenerationOptions): AIQueueJob<string> {
    return this.queue.enqueue((signal) => {
      const nextOptions: TextGenerationOptions = { ...options }
      const mergedSignal = mergeSignals(options.signal, signal)

      if (mergedSignal) {
        nextOptions.signal = mergedSignal
      }

      return this.generateText(nextOptions)
    }, options.signal)
  }

  enqueueImageGeneration(options: ImageGenerationOptions): AIQueueJob<string[]> {
    return this.queue.enqueue((signal) => {
      const nextOptions: ImageGenerationOptions = { ...options }
      const mergedSignal = mergeSignals(options.signal, signal)

      if (mergedSignal) {
        nextOptions.signal = mergedSignal
      }

      return this.generateImages(nextOptions)
    }, options.signal)
  }

  enqueueImageInpainting(options: ImageInpaintingOptions): AIQueueJob<string> {
    return this.queue.enqueue((signal) => {
      const nextOptions: ImageInpaintingOptions = { ...options }
      const mergedSignal = mergeSignals(options.signal, signal)

      if (mergedSignal) {
        nextOptions.signal = mergedSignal
      }

      return this.inpaintImage(nextOptions)
    }, options.signal)
  }

  enqueueCompletePersona(options: CompletePersonaOptions): AIQueueJob<PersonaBrand> {
    return this.queue.enqueue((signal) => {
      const nextOptions: CompletePersonaOptions = { ...options }
      const mergedSignal = mergeSignals(options.signal, signal)

      if (mergedSignal) {
        nextOptions.signal = mergedSignal
      }

      return this.generateCompletePersona(nextOptions)
    }, options.signal)
  }

  cancelAll() {
    this.queue.cancelAll()
  }

  async optimizePrompt(input: string, style: PersonaStyle, signal?: AbortSignal): Promise<string> {
    const trimmed = input.trim()

    if (!this.hasTextCredentials()) {
      return buildLocalOptimizedPrompt(trimmed, style)
    }

    const request: TextGenerationOptions = {
      responseFormat: 'text',
      temperature: 0.35,
      messages: [
        {
          role: 'system',
          content: '你是资深品牌策略师。请把用户输入增强为适合生成虚拟角色品牌与头像的中文 Prompt，要求具体、结构化、可执行，保留用户原意。',
        },
        {
          role: 'user',
          content: `风格：${styleLabelMap[style]}\n用户输入：${trimmed}`,
        },
      ],
    }

    if (signal) {
      request.signal = signal
    }

    return this.generateText(request)
  }

  async generateText(options: TextGenerationOptions): Promise<string> {
    this.assertTextConfig()

    const body = {
      model: this.config.text.model,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens,
      stream: Boolean(options.onDelta),
      response_format: options.responseFormat === 'json_object' && this.config.text.responseFormatEnabled ? { type: 'json_object' } : undefined,
    }

    return withRetry(
      async () => {
        const requestSignal = withTimeout(options.signal, this.config.requestTimeoutMs)
        const request: RequestInit = {
          method: 'POST',
          headers: this.createHeaders(this.config.text.apiKey),
          body: JSON.stringify(body),
        }

        if (requestSignal) {
          request.signal = requestSignal
        }

        const response = await fetch(joinUrl(this.config.text.baseUrl, this.config.text.chatPath), request)

        await assertResponse(response)

        if (options.onDelta) {
          return readOpenAICompatibleStream(response, options.onDelta)
        }

        const payload = (await response.json()) as ChatCompletionResponse
        return payload.choices?.[0]?.message?.content ?? ''
      },
      this.config.retryCount,
      this.config.retryBaseDelayMs,
      options.signal,
    )
  }

  async generateImages(options: ImageGenerationOptions): Promise<string[]> {
    this.assertImageConfig()

    return withRetry(
      async () => {
        options.onProgress?.({ status: 'queued', progress: 5, message: '图像任务已提交' })

        const request: RequestInit = {
          method: 'POST',
          headers: this.createHeaders(this.config.image.apiKey),
          body: JSON.stringify({
            model: this.config.image.model,
            prompt: options.prompt,
            n: options.count ?? 3,
            size: options.size ?? '1024x1024',
            response_format: 'url',
          }),
        }

        if (options.signal) {
          request.signal = options.signal
        }

        const response = await fetch(joinUrl(this.config.image.baseUrl, this.config.image.generationPath), request)

        await assertResponse(response)
        const payload = (await response.json()) as ImageGenerationResponse
        const immediateUrls = extractImageUrls(payload)

        if (immediateUrls.length > 0) {
          options.onProgress?.({ status: 'succeeded', progress: 100, message: '图像生成完成' })
          return immediateUrls
        }

        const taskId = payload.output?.task_id ?? payload.task_id ?? payload.id

        if (!taskId || !this.config.image.pollPath) {
          throw new AIServiceError('图像接口未返回图片 URL 或可轮询的 task id', 'provider', payload)
        }

        return this.pollImageTask(taskId, options)
      },
      this.config.retryCount,
      this.config.retryBaseDelayMs,
      options.signal,
    )
  }

  async inpaintImage(options: ImageInpaintingOptions): Promise<string> {
    this.assertImageConfig()

    const editPath = this.config.image.editPath

    if (!editPath) {
      throw new AIServiceError('缺少图像编辑接口路径，请配置 VITE_AI_IMAGE_EDIT_PATH', 'config')
    }

    return withRetry(
      async () => {
        options.onProgress?.({ status: 'queued', progress: 8, message: '局部重绘任务已提交' })

        const formData = new FormData()
        formData.append('model', this.config.image.model)
        formData.append('prompt', options.prompt)
        formData.append('size', options.size ?? '1024x1024')
        formData.append('image', dataUrlToBlob(options.imageDataUrl), 'avatar.png')
        formData.append('mask', dataUrlToBlob(options.maskDataUrl), 'mask.png')

        const request: RequestInit = {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.config.image.apiKey}`,
          },
          body: formData,
        }

        if (options.signal) {
          request.signal = options.signal
        }

        const response = await fetch(joinUrl(this.config.image.baseUrl, editPath), request)
        await assertResponse(response)

        const payload = (await response.json()) as ImageGenerationResponse
        const urls = extractImageUrls(payload)

        if (!urls[0]) {
          throw new AIServiceError('图像编辑接口未返回图片 URL', 'provider', payload)
        }

        options.onProgress?.({ status: 'succeeded', progress: 100, message: '局部重绘完成' })
        return urls[0]
      },
      this.config.retryCount,
      this.config.retryBaseDelayMs,
      options.signal,
    )
  }

  async generatePersonaTextIdentity(form: PersonaForm, signal?: AbortSignal, onDelta?: TextGenerationOptions['onDelta']): Promise<PersonaTextIdentity> {
    // Local prompt expansion is deterministic and avoids an extra slow LLM call in the main flow.
    const optimizedPrompt = buildLocalOptimizedPrompt(form.prompt, form.style)

    if (!this.hasTextCredentials()) {
      return createLocalTextIdentity(optimizedPrompt, form.style)
    }

    // Keep the main user flow to one LLM round trip: identity copy and image prompt are generated together.
    const request: TextGenerationOptions = {
      temperature: 0.45,
      maxTokens: 900,
      responseFormat: 'json_object',
      messages: [
        {
          role: 'system',
          content:
            '你是高级个人品牌策略师。必须只输出紧凑 JSON，不要 Markdown、解释或代码块。字段：nickname, username, signature, bio, tags, imagePrompt。bio 是一段统一自我介绍，不要按平台拆分。tags 是 5-7 个短标签。imagePrompt 用于头像生成，要求主体清晰、居中、可识别。',
        },
        {
          role: 'user',
          content: `风格：${styleLabelMap[form.style]}\n增强 Prompt：${optimizedPrompt}`,
        },
      ],
    }

    if (signal) {
      request.signal = signal
    }

    if (onDelta) {
      request.onDelta = onDelta
    }

    const content = await this.generateText(request)

    return parsePersonaTextIdentity(content, form.style)
  }

  async generateCompletePersona(options: CompletePersonaOptions): Promise<PersonaBrand> {
    const now = new Date().toISOString()
    const id = createId('brand')
    const identity = await this.generatePersonaTextIdentity(options.form, options.signal, options.onTextDelta)
    const imagePrompt = identity.imagePrompt || buildLocalOptimizedPrompt(options.form.prompt, options.form.style)
    let imageUrls: string[]

    if (this.hasImageCredentials()) {
      const imageOptions: ImageGenerationOptions = {
          prompt: imagePrompt,
          count: getImageCount(options.form),
          size: getImageSize(options.form),
        }

      if (options.signal) {
        imageOptions.signal = options.signal
      }

      if (options.onImageProgress) {
        imageOptions.onProgress = options.onImageProgress
      }

      imageUrls = await this.generateImages(imageOptions)
    } else {
      imageUrls = createLocalImageUrls(id, options.form.style, imagePrompt)
    }

    const avatars = imageUrls.map<AvatarVariant>((url, index) => ({
      id: createId('avatar'),
      url,
      label: ['主视觉', '社交款', '专业款'][index] ?? `变体 ${index + 1}`,
    }))

    return {
      id,
      prompt: options.form.prompt,
      style: options.form.style,
      avatars,
      avatarUrl: avatars[0]?.url ?? '',
      avatarUrls: avatars.map((avatar) => avatar.url),
      selectedAvatarId: avatars[0]?.id ?? '',
      nicknames: [identity.nickname, identity.username],
      nickname: identity.nickname,
      username: identity.username,
      signature: identity.signature,
      bio: identity.bio,
      bios: identity.bios,
      tags: identity.tags,
      params: createDefaultParams(options.form),
      createdAt: now,
      updatedAt: now,
    }
  }

  private async pollImageTask(taskId: string, options: ImageGenerationOptions): Promise<string[]> {
    const pollPath = this.config.image.pollPath

    if (!pollPath) {
      throw new AIServiceError('图像轮询地址未配置', 'config')
    }

    for (let attempt = 0; attempt < 60; attempt += 1) {
      throwIfAborted(options.signal)

      const progress = Math.min(12 + attempt * 4, 94)
      options.onProgress?.({ status: 'running', progress, message: '正在生成头像' })

      const request: RequestInit = {
        method: 'GET',
        headers: this.createHeaders(this.config.image.apiKey),
      }

      if (options.signal) {
        request.signal = options.signal
      }

      const response = await fetch(joinUrl(this.config.image.baseUrl, pollPath.replace(':taskId', taskId)), request)

      await assertResponse(response)
      const payload = (await response.json()) as ImagePollResponse
      const urls = extractImageUrls(payload)
      const status = normalizeImageStatus(payload.status ?? payload.output?.task_status)

      if (urls.length > 0 || status === 'succeeded') {
        options.onProgress?.({ status: 'succeeded', progress: 100, message: '图像生成完成' })
        return urls
      }

      if (status === 'failed') {
        throw new AIServiceError('图像生成失败', 'provider', payload)
      }

      await delay(1_500, options.signal)
    }

    throw new AIServiceError('图像生成超时', 'provider')
  }

  private createHeaders(apiKey: string): HeadersInit {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    }
  }

  private hasTextCredentials() {
    return Boolean(this.config.text.apiKey && this.config.text.baseUrl && this.config.text.model)
  }

  private hasImageCredentials() {
    return Boolean(this.config.image.apiKey && this.config.image.baseUrl && this.config.image.model)
  }

  canGenerateImages() {
    return this.hasImageCredentials()
  }

  private assertTextConfig() {
    if (!this.hasTextCredentials()) {
      throw new AIServiceError('缺少文本模型配置，请检查 VITE_AI_TEXT_API_KEY / VITE_AI_TEXT_BASE_URL / VITE_AI_TEXT_MODEL', 'config')
    }
  }

  private assertImageConfig() {
    if (!this.hasImageCredentials()) {
      throw new AIServiceError('缺少图像模型配置，请检查 VITE_AI_IMAGE_API_KEY / VITE_AI_IMAGE_BASE_URL / VITE_AI_IMAGE_MODEL', 'config')
    }
  }
}

export function createAIConfigFromEnv(): AIServiceConfig {
  const textProvider = readEnv('VITE_AI_TEXT_PROVIDER', 'doubao') as AIProvider
  const imageProvider = readEnv('VITE_AI_IMAGE_PROVIDER', 'doubao') as AIProvider

  return {
    text: {
      provider: textProvider,
      apiKey: readEnv('VITE_AI_TEXT_API_KEY'),
      baseUrl: readEnv('VITE_AI_TEXT_BASE_URL', defaultBaseUrl(textProvider)),
      model: readEnv('VITE_AI_TEXT_MODEL', defaultTextModel(textProvider)),
      chatPath: readEnv('VITE_AI_TEXT_CHAT_PATH', defaultChatPath(textProvider)),
      responseFormatEnabled: readBooleanEnv('VITE_AI_TEXT_RESPONSE_FORMAT_ENABLED', textProvider !== 'doubao'),
    },
    image: {
      provider: imageProvider,
      apiKey: readEnv('VITE_AI_IMAGE_API_KEY'),
      baseUrl: readEnv('VITE_AI_IMAGE_BASE_URL', defaultBaseUrl(imageProvider)),
      model: readEnv('VITE_AI_IMAGE_MODEL', defaultImageModel(imageProvider)),
      generationPath: readEnv('VITE_AI_IMAGE_GENERATION_PATH', defaultImageGenerationPath(imageProvider)),
      editPath: readEnv('VITE_AI_IMAGE_EDIT_PATH', '/v1/images/edits'),
      pollPath: readEnv('VITE_AI_IMAGE_POLL_PATH'),
    },
    maxConcurrency: Number(readEnv('VITE_AI_MAX_CONCURRENCY', '2')),
    retryCount: Number(readEnv('VITE_AI_RETRY_COUNT', '2')),
    retryBaseDelayMs: Number(readEnv('VITE_AI_RETRY_BASE_DELAY_MS', '700')),
    requestTimeoutMs: Number(readEnv('VITE_AI_REQUEST_TIMEOUT_MS', '45000')),
  }
}

function defaultBaseUrl(provider: AIProvider) {
  const baseUrls: Partial<Record<AIProvider, string>> = {
    doubao: 'https://ark.cn-beijing.volces.com/api/v3',
    deepseek: 'https://api.deepseek.com',
    dashscope: 'https://dashscope.aliyuncs.com/compatible-mode',
    siliconflow: 'https://api.siliconflow.cn',
    'openai-compatible': '',
    custom: '',
  }

  return baseUrls[provider] ?? ''
}

function defaultTextModel(provider: AIProvider) {
  const models: Partial<Record<AIProvider, string>> = {
    doubao: 'doubao-seed-2-0-pro-260215',
    deepseek: 'deepseek-chat',
    dashscope: 'qwen-plus',
    siliconflow: 'Qwen/Qwen2.5-72B-Instruct',
    'openai-compatible': '',
    custom: '',
  }

  return models[provider] ?? ''
}

function defaultImageModel(provider: AIProvider) {
  const models: Partial<Record<AIProvider, string>> = {
    doubao: '',
    siliconflow: 'black-forest-labs/FLUX.1-schnell',
    dashscope: 'wanx2.1-t2i-turbo',
    deepseek: '',
    'openai-compatible': '',
    custom: '',
  }

  return models[provider] ?? ''
}

function defaultChatPath(provider: AIProvider) {
  return provider === 'doubao' ? '/chat/completions' : '/v1/chat/completions'
}

function defaultImageGenerationPath(provider: AIProvider) {
  return provider === 'doubao' ? '/images/generations' : '/v1/images/generations'
}

export const aiService = new AIService()

async function readOpenAICompatibleStream(response: Response, onDelta: NonNullable<TextGenerationOptions['onDelta']>) {
  const reader = response.body?.getReader()

  if (!reader) {
    throw new AIServiceError('当前环境不支持读取流式响应', 'network')
  }

  const decoder = new TextDecoder()
  let buffer = ''
  let fullText = ''

  for (;;) {
    const { done, value } = await reader.read()

    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const rawLine of lines) {
      const line = rawLine.trim()

      if (!line.startsWith('data:')) {
        continue
      }

      const data = line.replace(/^data:\s*/, '')

      if (data === '[DONE]') {
        return fullText
      }

      try {
        const chunk = JSON.parse(data) as ChatCompletionChunk
        const delta = chunk.choices?.[0]?.delta?.content ?? ''

        if (delta) {
          fullText += delta
          onDelta(delta, fullText)
        }
      } catch {
        // Some providers emit heartbeat lines. Ignore non-JSON data chunks.
      }
    }
  }

  return fullText
}

function parsePersonaTextIdentity(raw: string, style: PersonaStyle): PersonaTextIdentity {
  try {
    const parsed = JSON.parse(extractJson(raw)) as Partial<PersonaTextIdentity>
    const fallback = createLocalTextIdentity(raw, style)
    const bio = parsed.bio || parsed.bios?.[0]?.content || fallback.bio

    return {
      nickname: parsed.nickname || fallback.nickname,
      username: parsed.username || fallback.username,
      signature: parsed.signature || fallback.signature,
      bio,
      bios: [{ platform: '自我介绍', content: bio }],
      tags: Array.isArray(parsed.tags) && parsed.tags.length > 0 ? parsed.tags : fallback.tags,
      imagePrompt: parsed.imagePrompt || buildLocalOptimizedPrompt(raw, style),
    }
  } catch (error) {
    throw new AIServiceError('文本模型返回内容不是合法 Persona JSON', 'parse', error)
  }
}

function createLocalTextIdentity(prompt: string, style: PersonaStyle): PersonaTextIdentity {
  const keywords = prompt
    .split(/[,，\s/]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 5)
  const base = keywords[0] ?? 'Nova'
  const styleName = styleLabelMap[style]
  const keyLine = keywords.length > 0 ? keywords.join(' / ') : 'AI / Persona / Creator'

  return {
    nickname: `${base}${styleSuffixMap[style]}`,
    username: `@${styleSlugMap[style]}_${base.toLowerCase().replace(/[^\da-z\u4e00-\u9fa5]/gi, '') || 'persona'}`,
    signature: `以${styleName}方式表达 ${keywords[1] ?? '灵感'}，让个人品牌被一眼记住。`,
    bio: `${styleName}人设｜围绕 ${keyLine} 持续创作，擅长把审美、经验和工具方法整理成清晰、有辨识度的个人品牌表达。`,
    bios: [
      {
        platform: '自我介绍',
        content: `${styleName}人设｜围绕 ${keyLine} 持续创作，擅长把审美、经验和工具方法整理成清晰、有辨识度的个人品牌表达。`,
      },
    ],
    tags: [...keywords.slice(0, 4), styleName, '可识别'],
    imagePrompt: buildLocalOptimizedPrompt(prompt, style),
  }
}

function createDefaultParams(form: PersonaForm | PersonaGenerationParams): PersonaGenerationParams {
  return {
    prompt: form.prompt,
    style: form.style,
    imageCount: 'imageCount' in form ? form.imageCount : 3,
    imageSize: 'imageSize' in form ? form.imageSize : '1024x1024',
    creativity: 'creativity' in form ? form.creativity : 0.75,
    outputLanguage: 'outputLanguage' in form ? form.outputLanguage : 'zh-CN',
  }
}

function getImageCount(form: PersonaForm | PersonaGenerationParams) {
  return 'imageCount' in form ? form.imageCount : 3
}

function getImageSize(form: PersonaForm | PersonaGenerationParams) {
  return 'imageSize' in form ? form.imageSize : '1024x1024'
}

function buildLocalOptimizedPrompt(input: string, style: PersonaStyle) {
  return [
    `主题：${input || 'AI 虚拟角色'}`,
    `风格：${styleLabelMap[style]}`,
    '目标：生成可用于社交媒体头像与个人品牌识别的虚拟角色',
    '要求：头像清晰、主体居中、五官/轮廓可辨识、适合小尺寸展示',
    '画面：高质量数字插画，干净背景，统一色彩系统，避免文字、水印和畸形细节',
  ].join('\n')
}

function createLocalImageUrls(id: string, style: PersonaStyle, prompt: string) {
  const collectionMap: Record<PersonaStyle, string> = {
    cyberpunk: 'bottts-neutral',
    anime: 'adventurer',
    workplace: 'notionists',
    professional: 'initials',
    xiaohongshu: 'lorelei',
    minimal: 'shapes',
  }

  return [0, 1, 2].map((index) => {
    const seed = encodeURIComponent(`${style}-${prompt}-${id}-${index}`)
    return `https://api.dicebear.com/9.x/${collectionMap[style]}/svg?seed=${seed}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`
  })
}

function extractImageUrls(payload: ImageGenerationResponse | ImagePollResponse): string[] {
  const direct = [
    ...(payload.data ?? []),
    ...(payload.images ?? []),
    ...(payload.output?.results ?? []),
    ...(payload.output?.images ?? []),
  ]
    .map((item) => item.url ?? (item.b64_json ? `data:image/png;base64,${item.b64_json}` : ''))
    .filter(Boolean)

  return [...direct, ...(payload.urls ?? [])]
}

function dataUrlToBlob(dataUrl: string) {
  const [header, payload] = dataUrl.split(',')
  const mime = header?.match(/data:(.*?);base64/)?.[1] ?? 'image/png'
  const binary = atob(payload ?? '')
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return new Blob([bytes], { type: mime })
}

function extractJson(input: string) {
  // Doubao may wrap JSON with prose when response_format is disabled; recover the first object block.
  const trimmed = input.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)

  if (fenced?.[1]) {
    return fenced[1].trim()
  }

  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')

  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1)
  }

  return trimmed
}

function normalizeImageStatus(status: string | undefined): ImageStatus {
  if (!status) {
    return 'running'
  }

  const normalized = status.toLowerCase()

  if (['succeeded', 'success', 'completed', 'done'].includes(normalized)) {
    return 'succeeded'
  }

  if (['failed', 'error', 'cancelled'].includes(normalized)) {
    return 'failed'
  }

  if (['queued', 'pending'].includes(normalized)) {
    return 'queued'
  }

  return 'running'
}

async function withRetry<T>(run: () => Promise<T>, retryCount: number, baseDelayMs: number, signal?: AbortSignal): Promise<T> {
  let lastError: unknown

  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    throwIfAborted(signal)

    try {
      return await run()
    } catch (error) {
      if (isAbortError(error) || attempt === retryCount) {
        throw normalizeError(error)
      }

      lastError = error
      await delay(baseDelayMs * 2 ** attempt, signal)
    }
  }

  throw normalizeError(lastError)
}

async function assertResponse(response: Response) {
  if (response.ok) {
    return
  }

  const text = await response.text().catch(() => '')
  throw new AIServiceError(`AI 接口请求失败：${response.status} ${text || response.statusText}`, 'provider')
}

function joinUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
}

function delay(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, ms)

    signal?.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timer)
        reject(new AIServiceError('生成已取消', 'abort'))
      },
      { once: true },
    )
  })
}

function mergeSignals(first?: AbortSignal, second?: AbortSignal) {
  if (!first) {
    return second
  }

  if (!second) {
    return first
  }

  const controller = new AbortController()
  const abort = () => controller.abort()
  first.addEventListener('abort', abort, { once: true })
  second.addEventListener('abort', abort, { once: true })

  return controller.signal
}

function withTimeout(signal: AbortSignal | undefined, timeoutMs: number) {
  if (!timeoutMs || timeoutMs <= 0) {
    return signal
  }

  const controller = new AbortController()
  const abort = () => controller.abort()
  const timer = window.setTimeout(abort, timeoutMs)

  signal?.addEventListener('abort', abort, { once: true })
  controller.signal.addEventListener(
    'abort',
    () => {
      window.clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
    },
    { once: true },
  )

  return controller.signal
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new AIServiceError('生成已取消', 'abort')
  }
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}

function normalizeError(error: unknown) {
  if (error instanceof AIServiceError) {
    return error
  }

  if (isAbortError(error)) {
    return new AIServiceError('生成已取消', 'abort', error)
  }

  return new AIServiceError(error instanceof Error ? error.message : 'AI 服务异常', 'network', error)
}

function readEnv(key: string, fallback = '') {
  return (import.meta.env[key] as string | undefined) || fallback
}

function readBooleanEnv(key: string, fallback = false) {
  const value = readEnv(key)

  if (!value) {
    return fallback
  }

  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

const styleLabelMap: Record<PersonaStyle, string> = {
  cyberpunk: '赛博朋克',
  anime: '日系动漫',
  workplace: '职场',
  professional: '专业',
  xiaohongshu: '小红书风',
  minimal: '极简科技',
}

const styleSuffixMap: Record<PersonaStyle, string> = {
  cyberpunk: '霓虹协议',
  anime: '晴空研究所',
  workplace: '增长顾问',
  professional: '品牌架构师',
  xiaohongshu: '灵感小站',
  minimal: 'Mono Lab',
}

const styleSlugMap: Record<PersonaStyle, string> = {
  cyberpunk: 'neon',
  anime: 'anime',
  workplace: 'work',
  professional: 'pro',
  xiaohongshu: 'daily',
  minimal: 'mono',
}
