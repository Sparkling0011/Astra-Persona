import { createDefaultAssetConfigs, createDefaultGenerationContext } from '@/constants/assets'
import type { AssetConfigState, AssetType, AvatarVariant, GenerationContext, PersonaBrand, PersonaForm, PersonaGenerationParams, PersonaStyle, PlatformBio } from '@/types/persona'
import { createId } from '@/utils/id'

type AIJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
type ImageStatus = 'queued' | 'running' | 'succeeded' | 'failed'

interface AIBaseConfig {
  baseUrl: string
  enabled: boolean
}

export interface TextModelConfig extends AIBaseConfig {
  chatPath: string
  responseFormatEnabled: boolean
}

export interface ImageModelConfig extends AIBaseConfig {
  generationPath: string
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

export interface ImageProgress {
  status: ImageStatus
  progress: number
  message?: string
}

export interface PersonaTextIdentity {
  nickname: string
  nicknames: string[]
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
          headers: this.createHeaders(),
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
          headers: this.createHeaders(),
          body: JSON.stringify({
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

  async generatePersonaTextIdentity(form: PersonaForm | PersonaGenerationParams, signal?: AbortSignal, onDelta?: TextGenerationOptions['onDelta']): Promise<PersonaTextIdentity> {
    // Local prompt expansion is deterministic and avoids an extra slow LLM call in the main flow.
    const optimizedPrompt = buildLocalOptimizedPrompt(form.prompt, form.style)
    const assetConfigs = getAssetConfigs(form)
    const context = getGenerationContext(form)
    const assetTypes = getRequestedAssetTypes(form)

    if (!this.hasTextCredentials()) {
      return createLocalTextIdentity(optimizedPrompt, form.style, assetConfigs, context)
    }

    // Keep the main user flow to one LLM round trip: identity copy and image prompt are generated together.
    const request: TextGenerationOptions = {
      temperature: mapCreativityToTemperature(getCreativity(form)),
      maxTokens: 900,
      responseFormat: 'json_object',
      messages: [
        {
          role: 'system',
          content:
            '你是高级个人品牌策略师。必须只输出紧凑 JSON，不要 Markdown、解释或代码块。字段：nickname, nicknames, username, signature, bio, tags, imagePrompt。nicknames 是候选昵称数组，nickname 必须等于其第一项。bio 只生成一段统一自我介绍，不按平台拆分。严格遵守用户给出的字数、数量、语气和内容约束。',
        },
        {
          role: 'user',
          content: buildPersonaInstruction(optimizedPrompt, form.style, assetTypes, assetConfigs, context),
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

    return parsePersonaTextIdentity(content, form.style, assetConfigs, context)
  }

  async generateCompletePersona(options: CompletePersonaOptions): Promise<PersonaBrand> {
    const now = new Date().toISOString()
    const id = createId('brand')
    const assetTypes = getRequestedAssetTypes(options.form)
    const assetConfigs = getAssetConfigs(options.form)
    const identity = await this.generatePersonaTextIdentity(options.form, options.signal, options.onTextDelta)
    const imagePrompt = buildImagePrompt(
      identity.imagePrompt || buildLocalOptimizedPrompt(options.form.prompt, options.form.style),
      assetConfigs.avatar,
    )
    let imageUrls: string[] = []

    if (assetTypes.includes('avatar') && this.hasImageCredentials()) {
      const imageOptions: ImageGenerationOptions = {
          prompt: imagePrompt,
          count: assetConfigs.avatar.imageCount,
          size: assetConfigs.avatar.imageSize,
        }

      if (options.signal) {
        imageOptions.signal = options.signal
      }

      if (options.onImageProgress) {
        imageOptions.onProgress = options.onImageProgress
      }

      imageUrls = await this.generateImages(imageOptions)
    } else if (assetTypes.includes('avatar')) {
      imageUrls = createLocalImageUrls(id, options.form.style, imagePrompt, assetConfigs.avatar.imageCount)
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
      nicknames: identity.nicknames,
      nickname: identity.nickname,
      username: identity.username,
      signature: identity.signature,
      bio: identity.bio,
      bios: identity.bios,
      tags: identity.tags,
      assetTypes,
      assetConfigs,
      generationContext: getGenerationContext(options.form),
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

  private createHeaders(): HeadersInit {
    return {
      'Content-Type': 'application/json',
    }
  }

  private hasTextCredentials() {
    // An empty base URL intentionally means same-origin /api through the Vite or Vercel proxy.
    return this.config.text.enabled
  }

  private hasImageCredentials() {
    return this.config.image.enabled
  }

  canGenerateImages() {
    return this.hasImageCredentials()
  }

  private assertTextConfig() {
    if (!this.hasTextCredentials()) {
      throw new AIServiceError('真实 AI 服务尚未启用，请检查 VITE_USE_REAL_AI 和 VITE_API_BASE_URL', 'config')
    }
  }

  private assertImageConfig() {
    if (!this.hasImageCredentials()) {
      throw new AIServiceError('图像生成服务尚未启用，请检查 VITE_ENABLE_REAL_IMAGE', 'config')
    }
  }
}

export function createAIConfigFromEnv(): AIServiceConfig {
  const apiBaseUrl = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL)
  const realAIEnabled = readBooleanEnv(import.meta.env.VITE_USE_REAL_AI, false)

  return {
    text: {
      enabled: realAIEnabled,
      baseUrl: apiBaseUrl,
      chatPath: '/api/ai/text',
      responseFormatEnabled: readBooleanEnv(import.meta.env.VITE_AI_TEXT_RESPONSE_FORMAT_ENABLED, false),
    },
    image: {
      enabled: realAIEnabled && readBooleanEnv(import.meta.env.VITE_ENABLE_REAL_IMAGE, false),
      baseUrl: apiBaseUrl,
      generationPath: '/api/ai/image',
      pollPath: '/api/ai/image/tasks/:taskId',
    },
    maxConcurrency: Number(import.meta.env.VITE_AI_MAX_CONCURRENCY || '2'),
    retryCount: Number(import.meta.env.VITE_AI_RETRY_COUNT || '2'),
    retryBaseDelayMs: Number(import.meta.env.VITE_AI_RETRY_BASE_DELAY_MS || '700'),
    requestTimeoutMs: Number(import.meta.env.VITE_AI_REQUEST_TIMEOUT_MS || '120000'),
  }
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

function parsePersonaTextIdentity(
  raw: string,
  style: PersonaStyle,
  configs: AssetConfigState,
  context: GenerationContext,
): PersonaTextIdentity {
  try {
    const parsed = JSON.parse(extractJson(raw)) as Partial<PersonaTextIdentity>
    const fallback = createLocalTextIdentity(raw, style, configs, context)
    const bio = parsed.bio || parsed.bios?.[0]?.content || fallback.bio
    const nicknames = Array.isArray(parsed.nicknames) && parsed.nicknames.length > 0
      ? parsed.nicknames.slice(0, configs.identity.candidateCount)
      : fallback.nicknames
    const nickname = parsed.nickname || nicknames[0] || fallback.nickname

    return {
      nickname,
      nicknames: [nickname, ...nicknames.filter((item) => item !== nickname)].slice(0, configs.identity.candidateCount),
      username: parsed.username || fallback.username,
      signature: parsed.signature || fallback.signature,
      bio,
      bios: [{ platform: '自我介绍', content: bio }],
      tags: formatTags(
        Array.isArray(parsed.tags) && parsed.tags.length > 0 ? parsed.tags : fallback.tags,
        configs.tags,
      ),
      imagePrompt: parsed.imagePrompt || buildLocalOptimizedPrompt(raw, style),
    }
  } catch (error) {
    throw new AIServiceError('文本模型返回内容不是合法 Persona JSON', 'parse', error)
  }
}

function createLocalTextIdentity(
  prompt: string,
  style: PersonaStyle,
  configs: AssetConfigState = createDefaultAssetConfigs(),
  context: GenerationContext = createDefaultGenerationContext(),
): PersonaTextIdentity {
  const themeInput = prompt.match(/^主题：(.+)$/m)?.[1] ?? prompt
  const keywords = themeInput
    .split(/[,，\s/]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 5)
  const base = keywords[0] ?? 'Nova'
  const styleName = styleLabelMap[style]
  const keyLine = keywords.length > 0 ? keywords.join(' / ') : 'AI / Persona / Creator'
  const requiredKeywords = context.requiredKeywords.split(/[,，/]+/).map((item) => item.trim()).filter(Boolean)
  const nicknameCandidates = Array.from({ length: configs.identity.candidateCount }, (_, index) => {
    const chineseSuffixes = [styleSuffixMap[style], '创意档案', '灵感坐标', '工作室', '观察站', '方法论']
    const englishSuffixes = ['Studio', 'Persona Lab', 'Works', 'Signal', 'Profile', 'Notes']
    const englishName = `${capitalize(styleSlugMap[style])} ${englishSuffixes[index] ?? `Brand ${index + 1}`}`

    if (configs.identity.namingStyle === 'english') {
      return englishName
    }

    const chineseName = `${base}${chineseSuffixes[index] ?? `品牌 ${index + 1}`}`
    return configs.identity.namingStyle === 'bilingual' ? `${chineseName} · ${englishName}` : chineseName
  })
  const signatureBase = createLocalSignature(keywords, styleName, configs.signature)
  const signature = fitTextLength(signatureBase, signatureLengthRange[configs.signature.length])
  const bioBase = createLocalBio(base, keyLine, styleName, configs.bio, context)
  const bio = fitTextLength(bioBase, bioLengthRange[configs.bio.length])
  const categoryTags = configs.tags.categories.map((category) => tagCategoryFallbackMap[category])
  const localTags = formatTags([...requiredKeywords, ...keywords, styleName, ...categoryTags, ...context.brandVoice.map((voice) => voiceLabelMap[voice])], configs.tags)
  const usernameBase = base.toLowerCase().replace(/[^\da-z\u4e00-\u9fa5]/gi, '') || 'persona'
  const usernameSuffix = configs.identity.allowNumbers ? '26' : ''

  return {
    nickname: nicknameCandidates[0] ?? `${base}${styleSuffixMap[style]}`,
    nicknames: nicknameCandidates,
    username: `@${styleSlugMap[style]}_${usernameBase}${usernameSuffix}`,
    signature,
    bio,
    bios: [
      {
        platform: '自我介绍',
        content: bio,
      },
    ],
    tags: localTags,
    imagePrompt: buildLocalOptimizedPrompt(prompt, style),
  }
}

function createLocalSignature(
  keywords: string[],
  styleName: string,
  config: AssetConfigState['signature'],
) {
  const subject = keywords[1] ?? keywords[0] ?? '灵感'
  const structureCopy = {
    value: `把${subject}变成清晰、可复用的价值`,
    expertise: `专注${subject}，用专业方法解决真实问题`,
    attitude: `不追逐噪声，只持续表达${subject}`,
    hybrid: `以${styleName}方式深耕${subject}，让专业被看见`,
  } satisfies Record<AssetConfigState['signature']['structure'], string>
  const tonePrefix = {
    professional: '',
    friendly: '和你一起，',
    bold: '拒绝平庸，',
  } satisfies Record<AssetConfigState['signature']['tone'], string>

  return `${tonePrefix[config.tone]}${structureCopy[config.structure]}${config.allowEmoji ? ' ✦' : ''}`
}

function createLocalBio(
  base: string,
  keyLine: string,
  styleName: string,
  config: AssetConfigState['bio'],
  context: GenerationContext,
) {
  const subject = config.voice === 'first-person' ? '我' : base
  const sections = config.emphasis.map((emphasis) => {
    const copy = {
      identity: `${subject}是一名以${styleName}方式持续创作的个人品牌实践者`,
      expertise: `长期关注 ${keyLine}，擅长把复杂经验整理成清晰方法`,
      value: `希望为${context.audience}提供有辨识度且能够落地的内容价值`,
      proof: '持续通过真实项目沉淀经验，并用作品验证判断',
    } satisfies Record<AssetConfigState['bio']['emphasis'][number], string>
    return copy[emphasis]
  })

  return `${sections.join('。')}。${config.includeCta ? '欢迎交流想法与合作机会。' : ''}${config.customInstruction ? ` ${config.customInstruction}` : ''}`
}

function createDefaultParams(form: PersonaForm | PersonaGenerationParams): PersonaGenerationParams {
  const configs = getAssetConfigs(form)
  const context = getGenerationContext(form)

  return {
    prompt: form.prompt,
    style: form.style,
    imageCount: configs.avatar.imageCount,
    imageSize: configs.avatar.imageSize,
    creativity: 'creativity' in form ? form.creativity : 0.75,
    outputLanguage: context.language === 'en-US' ? 'en-US' : 'zh-CN',
    assetTypes: getRequestedAssetTypes(form),
    assetConfigs: configs,
    generationContext: context,
  }
}

function getCreativity(form: PersonaForm | PersonaGenerationParams) {
  return 'creativity' in form ? form.creativity : 0.75
}

function getRequestedAssetTypes(form: PersonaForm | PersonaGenerationParams): AssetType[] {
  const requested = (form as PersonaGenerationParams).assetTypes
  return requested?.length ? [...requested] : ['identity', 'avatar', 'signature', 'bio', 'tags']
}

function getAssetConfigs(form: PersonaForm | PersonaGenerationParams): AssetConfigState {
  const defaults = createDefaultAssetConfigs()
  const saved = (form as PersonaGenerationParams).assetConfigs

  return {
    identity: { ...defaults.identity, ...saved?.identity },
    avatar: { ...defaults.avatar, ...saved?.avatar },
    signature: { ...defaults.signature, ...saved?.signature },
    bio: {
      ...defaults.bio,
      ...saved?.bio,
      emphasis: [...(saved?.bio?.emphasis ?? defaults.bio.emphasis)],
    },
    tags: {
      ...defaults.tags,
      ...saved?.tags,
      categories: [...(saved?.tags?.categories ?? defaults.tags.categories)],
    },
  }
}

function getGenerationContext(form: PersonaForm | PersonaGenerationParams): GenerationContext {
  const defaults = createDefaultGenerationContext()
  const saved = (form as PersonaGenerationParams).generationContext

  return {
    ...defaults,
    ...saved,
    brandVoice: [...(saved?.brandVoice ?? defaults.brandVoice)],
  }
}

function buildPersonaInstruction(
  optimizedPrompt: string,
  style: PersonaStyle,
  assetTypes: AssetType[],
  configs: AssetConfigState,
  context: GenerationContext,
) {
  const requirements: string[] = []

  if (assetTypes.includes('identity')) {
    requirements.push(
      `名称与用户名：生成 ${configs.identity.candidateCount} 个候选昵称；命名倾向为${identityNamingLabelMap[configs.identity.namingStyle]}；辨识程度为${identityMemorabilityLabelMap[configs.identity.memorability]}；账号名${configs.identity.allowNumbers ? '可以' : '不允许'}包含数字。${configs.identity.customInstruction}`,
    )
  }

  if (assetTypes.includes('signature')) {
    requirements.push(
      `社交签名：${signatureLengthLabelMap[configs.signature.length]}；语气为${signatureToneLabelMap[configs.signature.tone]}；结构为${signatureStructureLabelMap[configs.signature.structure]}；${configs.signature.allowEmoji ? '允许最多一个恰当 Emoji' : '不要使用 Emoji'}。${configs.signature.customInstruction}`,
    )
  }

  if (assetTypes.includes('bio')) {
    requirements.push(
      `个人简介：${bioLengthLabelMap[configs.bio.length]}；使用${configs.bio.voice === 'first-person' ? '第一人称' : '第三人称'}；重点覆盖${configs.bio.emphasis.map((item) => bioEmphasisLabelMap[item]).join('、')}；${configs.bio.includeCta ? '结尾包含自然的行动引导' : '不要添加营销式行动引导'}。${configs.bio.customInstruction}`,
    )
  }

  if (assetTypes.includes('tags')) {
    requirements.push(
      `关键词标签：严格生成 ${configs.tags.count} 个；范围为${tagDensityLabelMap[configs.tags.density]}；包含${configs.tags.categories.map((item) => tagCategoryLabelMap[item]).join('、')}；${configs.tags.format === 'hashtag' ? '每项以 # 开头' : '不要添加 #'}。${configs.tags.customInstruction}`,
    )
  }

  if (assetTypes.includes('avatar')) {
    requirements.push(`头像 Prompt：${buildImagePrompt('主体清晰、可识别，适合个人品牌头像', configs.avatar)}`)
  }

  return [
    `本次生成内容：${assetTypes.map((type) => assetTypeLabelMap[type]).join('、')}`,
    `使用目标：${goalLabelMap[context.goal]}`,
    `目标受众：${context.audience}`,
    `品牌语气：${context.brandVoice.map((voice) => voiceLabelMap[voice]).join('、')}`,
    `输出语言：${languageLabelMap[context.language]}`,
    `整体风格：${styleLabelMap[style]}`,
    context.requiredKeywords ? `必须自然包含：${context.requiredKeywords}` : '',
    context.excludedKeywords ? `禁止出现：${context.excludedKeywords}` : '',
    ...requirements,
    `品牌简述：\n${optimizedPrompt}`,
  ].filter(Boolean).join('\n')
}

function formatTags(tags: string[], config: AssetConfigState['tags']) {
  const normalized = [...new Set(tags.map((tag) => tag.trim().replace(/^#+/, '')).filter(Boolean))]
  const filled = [...normalized]

  while (filled.length < config.count) {
    filled.push(`品牌关键词${filled.length + 1}`)
  }

  return filled.slice(0, config.count).map((tag) => config.format === 'hashtag' ? `#${tag}` : tag)
}

function fitTextLength(text: string, [min, max]: readonly [number, number]) {
  const filler = '持续输出有价值、可识别的内容表达。'
  let result = text

  while (result.length < min) {
    result += filler
  }

  return result.length > max ? `${result.slice(0, Math.max(1, max - 1))}。` : result
}

function capitalize(value: string) {
  return value ? `${value[0]?.toUpperCase() ?? ''}${value.slice(1)}` : value
}

function mapCreativityToTemperature(creativity: number) {
  return Math.min(0.85, Math.max(0.25, 0.25 + creativity * 0.6))
}

function buildImagePrompt(prompt: string, config: AssetConfigState['avatar']) {
  const medium = avatarMediumLabelMap[config.medium]
  const framing = avatarFramingLabelMap[config.framing]
  const background = avatarBackgroundLabelMap[config.background]
  const variety = avatarVarietyLabelMap[config.variety]

  return [
    prompt,
    `视觉媒介：${medium}；人物构图：${framing}；背景：${background}。`,
    `风格强度：${config.styleStrength.toFixed(2)}；变体策略：${variety}。`,
    config.customInstruction ? `额外要求：${config.customInstruction}` : '',
  ].filter(Boolean).join('\n')
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

function createLocalImageUrls(id: string, style: PersonaStyle, prompt: string, count = 3) {
  const collectionMap: Record<PersonaStyle, string> = {
    cyberpunk: 'bottts-neutral',
    anime: 'adventurer',
    workplace: 'notionists',
    professional: 'initials',
    xiaohongshu: 'lorelei',
    minimal: 'shapes',
  }

  return Array.from({ length: count }, (_, index) => {
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

function normalizeApiBaseUrl(baseUrl: string | undefined) {
  // Accept legacy values such as "/api" while keeping route paths centralized below.
  return (baseUrl ?? '').trim().replace(/\/api\/?$/, '')
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

function readBooleanEnv(value: string | undefined, fallback = false) {
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

const assetTypeLabelMap: Record<AssetType, string> = {
  identity: '名称与用户名',
  avatar: '头像',
  signature: '社交签名',
  bio: '个人简介',
  tags: '关键词标签',
}

const goalLabelMap: Record<GenerationContext['goal'], string> = {
  'personal-brand': '打造个人品牌',
  'job-search': '求职与职业展示',
  creator: '内容创作',
  freelance: '自由职业获客',
  founder: '创始人形象',
}

const voiceLabelMap: Record<GenerationContext['brandVoice'][number], string> = {
  professional: '专业',
  friendly: '亲和',
  restrained: '克制',
  bold: '鲜明',
  warm: '温暖',
  witty: '幽默',
}

const languageLabelMap: Record<GenerationContext['language'], string> = {
  'zh-CN': '简体中文',
  'en-US': '英文',
  bilingual: '中英结合',
}

const identityNamingLabelMap: Record<AssetConfigState['identity']['namingStyle'], string> = {
  chinese: '中文为主',
  bilingual: '中英结合',
  english: '英文为主',
}

const identityMemorabilityLabelMap: Record<AssetConfigState['identity']['memorability'], string> = {
  stable: '稳妥易懂',
  balanced: '平衡',
  distinctive: '鲜明独特',
}

const signatureLengthRange = {
  short: [6, 14],
  medium: [15, 28],
  long: [29, 45],
} as const

const signatureLengthLabelMap: Record<AssetConfigState['signature']['length'], string> = {
  short: '6-14 字',
  medium: '15-28 字',
  long: '29-45 字',
}

const signatureToneLabelMap: Record<AssetConfigState['signature']['tone'], string> = {
  professional: '专业',
  friendly: '亲和',
  bold: '鲜明',
}

const signatureStructureLabelMap: Record<AssetConfigState['signature']['structure'], string> = {
  value: '突出提供的价值',
  expertise: '突出专业能力',
  attitude: '表达态度主张',
  hybrid: '综合表达',
}

const bioLengthRange = {
  short: [50, 80],
  medium: [100, 150],
  long: [180, 260],
} as const

const bioLengthLabelMap: Record<AssetConfigState['bio']['length'], string> = {
  short: '50-80 字',
  medium: '100-150 字',
  long: '180-260 字',
}

const bioEmphasisLabelMap: Record<AssetConfigState['bio']['emphasis'][number], string> = {
  identity: '身份定位',
  expertise: '专业能力',
  value: '提供价值',
  proof: '经历成果',
}

const tagDensityLabelMap: Record<AssetConfigState['tags']['density'], string> = {
  focused: '高度聚焦',
  balanced: '平衡',
  broad: '适度扩展',
}

const tagCategoryLabelMap: Record<AssetConfigState['tags']['categories'][number], string> = {
  identity: '身份定位',
  expertise: '专业能力',
  topic: '内容主题',
  personality: '个性特征',
}

const tagCategoryFallbackMap: Record<AssetConfigState['tags']['categories'][number], string> = {
  identity: '个人品牌',
  expertise: '专业方法',
  topic: '内容创作',
  personality: '真诚表达',
}

const avatarMediumLabelMap: Record<AssetConfigState['avatar']['medium'], string> = {
  photo: '写实摄影',
  illustration: '高质量数字插画',
  anime: '日系动漫',
  '3d': '精致 3D 角色',
  flat: '现代扁平设计',
}

const avatarFramingLabelMap: Record<AssetConfigState['avatar']['framing'], string> = {
  headshot: '头像特写',
  bust: '半身肖像',
  'half-body': '上半身场景',
}

const avatarBackgroundLabelMap: Record<AssetConfigState['avatar']['background'], string> = {
  minimal: '极简留白',
  gradient: '品牌渐变',
  scene: '轻量环境场景',
}

const avatarVarietyLabelMap: Record<AssetConfigState['avatar']['variety'], string> = {
  subtle: '保持角色高度一致，只做细节变化',
  balanced: '保持识别度并适度变化',
  diverse: '明显改变构图与视觉细节',
}
