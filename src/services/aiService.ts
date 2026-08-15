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
  signal?: AbortSignal | undefined
  onDelta?: ((delta: string, fullText: string) => void) | undefined
}

export interface ImageGenerationOptions {
  prompt: string
  count?: number
  size?: string
  signal?: AbortSignal | undefined
  onProgress?: ((progress: ImageProgress) => void) | undefined
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

export type PersonaAssetUpdate =
  | {
    type: 'identity'
    value: Pick<PersonaBrand, 'nickname' | 'nicknames' | 'username'>
  }
  | {
    type: 'avatar'
    value: Pick<PersonaBrand, 'avatars' | 'avatarUrl' | 'avatarUrls' | 'selectedAvatarId'>
  }
  | {
    type: 'signature'
    value: Pick<PersonaBrand, 'signature'>
  }
  | {
    type: 'bio'
    value: Pick<PersonaBrand, 'bio' | 'bios'>
  }
  | {
    type: 'tags'
    value: Pick<PersonaBrand, 'tags'>
  }

export interface CompletePersonaOptions {
  form: PersonaForm | PersonaGenerationParams
  signal?: AbortSignal | undefined
  onTextDelta?: TextGenerationOptions['onDelta']
  onImageProgress?: ImageGenerationOptions['onProgress']
  onAssetComplete?: ((update: PersonaAssetUpdate) => void) | undefined
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
    public readonly retryable = false,
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
    const context = getGenerationContext(options.form)
    const persona: PersonaBrand = {
      id,
      prompt: options.form.prompt,
      style: options.form.style,
      avatars: [],
      avatarUrl: '',
      avatarUrls: [],
      selectedAvatarId: '',
      nicknames: [],
      nickname: '',
      username: '',
      signature: '',
      bio: '',
      bios: [],
      tags: [],
      assetTypes,
      assetConfigs,
      generationContext: context,
      params: createDefaultParams(options.form),
      createdAt: now,
      updatedAt: now,
    }

    const controller = new AbortController()
    const signal = mergeSignals(options.signal, controller.signal)
    const tasks = this.createAssetTasks(options.form, id, assetTypes, assetConfigs, context, signal, options)

    try {
      await runConcurrent(tasks, this.config.maxConcurrency, signal, (update) => {
        applyAssetUpdate(persona, update)
        persona.updatedAt = new Date().toISOString()
        options.onAssetComplete?.(update)
      })
    } catch (error) {
      controller.abort()
      throw error
    }

    return persona
  }

  private createAssetTasks(
    form: PersonaForm | PersonaGenerationParams,
    id: string,
    assetTypes: AssetType[],
    configs: AssetConfigState,
    context: GenerationContext,
    signal: AbortSignal | undefined,
    options: CompletePersonaOptions,
  ): Array<() => Promise<PersonaAssetUpdate>> {
    const tasks: Array<() => Promise<PersonaAssetUpdate>> = []

    if (assetTypes.includes('identity')) {
      tasks.push(() => this.generateIdentityAsset(form, configs, context, signal))
    }

    if (assetTypes.includes('signature')) {
      tasks.push(() => this.generateSignatureAsset(form, configs, context, signal))
    }

    if (assetTypes.includes('bio')) {
      tasks.push(() => this.generateBioAsset(form, configs, context, signal))
    }

    if (assetTypes.includes('tags')) {
      tasks.push(() => this.generateTagsAsset(form, configs, context, signal))
    }

    if (assetTypes.includes('avatar')) {
      tasks.push(() => this.generateAvatarAsset(form, id, configs, context, signal, options.onImageProgress))
    }

    return tasks
  }

  private async generateIdentityAsset(
    form: PersonaForm | PersonaGenerationParams,
    configs: AssetConfigState,
    context: GenerationContext,
    signal?: AbortSignal,
  ): Promise<PersonaAssetUpdate> {
    const fallback = createLocalTextIdentity(form.prompt, form.style, configs, context)

    if (!this.hasTextCredentials()) {
      return { type: 'identity', value: pickIdentity(fallback) }
    }

    const parsed = await this.generateStructuredAsset<Partial<PersonaTextIdentity>>({
      system: '你是中文命名编辑。只输出 JSON，不要解释。命名必须可读、可记、与用户真实定位有关；拒绝空泛的科技感词堆砌，也不要虚构成绩。',
      instruction: `${buildGroundedBrief(form, context)}\n\n任务：给出 ${configs.identity.candidateCount} 个互不重复的昵称，以及一个可用于社交平台的 username。\nJSON 字段：nickname, nicknames, username。nickname 必须等于 nicknames 的第一项。命名倾向：${identityNamingLabelMap[configs.identity.namingStyle]}；辨识程度：${identityMemorabilityLabelMap[configs.identity.memorability]}；账号名${configs.identity.allowNumbers ? '允许' : '不允许'}数字。${configs.identity.customInstruction ? `额外要求：${configs.identity.customInstruction}` : ''}`,
      maxTokens: 260,
      form,
      signal,
    })
    const nicknames = Array.isArray(parsed.nicknames)
      ? parsed.nicknames.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).slice(0, configs.identity.candidateCount)
      : fallback.nicknames
    const nickname = typeof parsed.nickname === 'string' && parsed.nickname.trim() ? parsed.nickname.trim() : nicknames[0] ?? fallback.nickname

    return {
      type: 'identity',
      value: {
        nickname,
        nicknames: [nickname, ...nicknames.filter((item) => item !== nickname)].slice(0, configs.identity.candidateCount),
        username: typeof parsed.username === 'string' && parsed.username.trim() ? parsed.username.trim() : fallback.username,
      },
    }
  }

  private async generateSignatureAsset(
    form: PersonaForm | PersonaGenerationParams,
    configs: AssetConfigState,
    context: GenerationContext,
    signal?: AbortSignal,
  ): Promise<PersonaAssetUpdate> {
    const fallback = createLocalTextIdentity(form.prompt, form.style, configs, context)
    const value = !this.hasTextCredentials()
      ? fallback.signature
      : await this.generateCopyWithQualityGate({
        system: '你是有判断力的个人品牌文案编辑。只输出 JSON，不要解释。签名必须像一个人说的话，有具体立场，不要写岗位说明或营销口号。不得编造经历。',
        instruction: `${buildGroundedBrief(form, context)}\n\n任务：写 1 条社交签名。${signatureLengthLabelMap[configs.signature.length]}；语气为${signatureToneLabelMap[configs.signature.tone]}；结构为${signatureStructureLabelMap[configs.signature.structure]}；${configs.signature.allowEmoji ? '最多可使用一个自然的 Emoji。' : '不要使用 Emoji。'}${configs.signature.customInstruction ? `额外要求：${configs.signature.customInstruction}` : ''}\nJSON 字段：signature。`,
        key: 'signature',
        fallback: fallback.signature,
        maxTokens: 150,
        form,
        context,
        signal,
      })

    return { type: 'signature', value: { signature: value } }
  }

  private async generateBioAsset(
    form: PersonaForm | PersonaGenerationParams,
    configs: AssetConfigState,
    context: GenerationContext,
    signal?: AbortSignal,
  ): Promise<PersonaAssetUpdate> {
    const fallback = createLocalTextIdentity(form.prompt, form.style, configs, context)
    const value = !this.hasTextCredentials()
      ? fallback.bio
      : await this.generateCopyWithQualityGate({
        system: '你是中文个人简介编辑。只输出 JSON，不要解释。优先使用用户给出的真实经历、项目和观点；未提供事实时保持克制，绝不杜撰成绩。写出具体的人，不写品牌咨询腔。',
        instruction: `${buildGroundedBrief(form, context)}\n\n任务：写 1 段统一个人简介。${bioLengthLabelMap[configs.bio.length]}；使用${configs.bio.voice === 'first-person' ? '第一人称' : '第三人称'}；重点覆盖${configs.bio.emphasis.map((item) => bioEmphasisLabelMap[item]).join('、')}；${configs.bio.includeCta ? '结尾给出自然、具体的行动邀请。' : '不要添加营销式行动引导。'}${configs.bio.customInstruction ? `额外要求：${configs.bio.customInstruction}` : ''}\nJSON 字段：bio。`,
        key: 'bio',
        fallback: fallback.bio,
        maxTokens: configs.bio.length === 'long' ? 420 : 280,
        form,
        context,
        signal,
      })

    return { type: 'bio', value: { bio: value, bios: [{ platform: '自我介绍', content: value }] } }
  }

  private async generateTagsAsset(
    form: PersonaForm | PersonaGenerationParams,
    configs: AssetConfigState,
    context: GenerationContext,
    signal?: AbortSignal,
  ): Promise<PersonaAssetUpdate> {
    const fallback = createLocalTextIdentity(form.prompt, form.style, configs, context)

    if (!this.hasTextCredentials()) {
      return { type: 'tags', value: { tags: fallback.tags } }
    }

    const parsed = await this.generateStructuredAsset<{ tags?: unknown }>({
      system: '你是内容定位编辑。只输出 JSON，不要解释。标签要兼顾检索词和人的辨识度，禁止使用空泛营销词，不要虚构身份或成就。',
      instruction: `${buildGroundedBrief(form, context)}\n\n任务：严格生成 ${configs.tags.count} 个标签。范围为${tagDensityLabelMap[configs.tags.density]}；包含${configs.tags.categories.map((item) => tagCategoryLabelMap[item]).join('、')}；${configs.tags.format === 'hashtag' ? '每项以 # 开头。' : '不要添加 #。'}${configs.tags.customInstruction ? `额外要求：${configs.tags.customInstruction}` : ''}\nJSON 字段：tags（字符串数组）。`,
      maxTokens: 160,
      form,
      signal,
    })
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags.filter((item): item is string => typeof item === 'string')
      : fallback.tags

    return { type: 'tags', value: { tags: formatTags(tags, configs.tags) } }
  }

  private async generateAvatarAsset(
    form: PersonaForm | PersonaGenerationParams,
    id: string,
    configs: AssetConfigState,
    context: GenerationContext,
    signal?: AbortSignal,
    onProgress?: ImageGenerationOptions['onProgress'],
  ): Promise<PersonaAssetUpdate> {
    const imagePrompt = buildImagePrompt(buildAvatarBrief(form, context), configs.avatar)
    const imageUrls = this.hasImageCredentials()
      ? await this.generateImages({ prompt: imagePrompt, count: configs.avatar.imageCount, size: configs.avatar.imageSize, signal, onProgress })
      : createLocalImageUrls(id, form.style, imagePrompt, configs.avatar.imageCount)
    const isDemoAvatar = !this.hasImageCredentials()
    const avatars = imageUrls.map<AvatarVariant>((url, index) => ({
      id: createId('avatar'),
      url,
      label: isDemoAvatar
        ? `示例头像 ${index + 1}`
        : ['主视觉', '社交款', '专业款'][index] ?? `变体 ${index + 1}`,
    }))

    return {
      type: 'avatar',
      value: {
        avatars,
        avatarUrl: avatars[0]?.url ?? '',
        avatarUrls: avatars.map((avatar) => avatar.url),
        selectedAvatarId: avatars[0]?.id ?? '',
      },
    }
  }

  private async generateStructuredAsset<T>(options: {
    system: string
    instruction: string
    maxTokens: number
    form: PersonaForm | PersonaGenerationParams
    signal?: AbortSignal | undefined
  }): Promise<T> {
    const content = await this.generateText({
      temperature: mapCreativityToTemperature(getCreativity(options.form)),
      maxTokens: options.maxTokens,
      responseFormat: 'json_object',
      signal: options.signal,
      messages: [
        { role: 'system', content: options.system },
        { role: 'user', content: options.instruction },
      ],
    })

    try {
      return JSON.parse(extractJson(content)) as T
    } catch (error) {
      throw new AIServiceError('文本模型返回内容不是合法 JSON', 'parse', error)
    }
  }

  private async generateCopyWithQualityGate(options: {
    system: string
    instruction: string
    key: 'signature' | 'bio'
    fallback: string
    maxTokens: number
    form: PersonaForm | PersonaGenerationParams
    context: GenerationContext
    signal?: AbortSignal | undefined
  }): Promise<string> {
    const parsed = await this.generateStructuredAsset<Record<string, unknown>>(options)
    const initialValue = parsed[options.key]
    const initial = typeof initialValue === 'string' && initialValue.trim()
      ? initialValue.trim()
      : options.fallback
    const issues = getCopyQualityIssues(initial, options.context)

    if (!issues.length) {
      return initial
    }

    const refined = await this.generateStructuredAsset<Record<string, unknown>>({
      system: '你是严谨的中文文案审校编辑。只输出 JSON，不要解释。保留真实信息，删除套话和空泛修辞；绝不补充未提供的经历、客户、数字或成绩。',
      instruction: `${buildGroundedBrief(options.form, options.context)}\n\n原文：${initial}\n\n问题：${issues.join('；')}\n\n请重写这段${options.key === 'signature' ? '社交签名' : '个人简介'}，保留原有意图，语言自然具体。JSON 字段：${options.key}。`,
      maxTokens: options.maxTokens,
      form: options.form,
      signal: options.signal,
    })

    const refinedValue = refined[options.key]
    return typeof refinedValue === 'string' && refinedValue.trim()
      ? refinedValue.trim()
      : initial
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
      throw new AIServiceError('AI 服务暂时不可用，请联系管理员', 'config')
    }
  }

  private assertImageConfig() {
    if (!this.hasImageCredentials()) {
      throw new AIServiceError('图像生成服务暂时不可用，请联系管理员', 'config')
    }
  }
}

export function createAIConfigFromEnv(): AIServiceConfig {
  const apiBaseUrl = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL)
  const realAIEnabled = readBooleanEnv(import.meta.env.VITE_USE_REAL_AI, false)
  const hasProductionApiBaseUrl = !import.meta.env.PROD || Boolean(apiBaseUrl)

  return {
    text: {
      enabled: realAIEnabled && hasProductionApiBaseUrl,
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
    maxConcurrency: Number(import.meta.env.VITE_AI_MAX_CONCURRENCY || '3'),
    retryCount: Number(import.meta.env.VITE_AI_RETRY_COUNT || '1'),
    retryBaseDelayMs: Number(import.meta.env.VITE_AI_RETRY_BASE_DELAY_MS || '700'),
    requestTimeoutMs: Number(import.meta.env.VITE_AI_REQUEST_TIMEOUT_MS || '60000'),
  }
}

export const aiService = new AIService()

async function runConcurrent(
  tasks: Array<() => Promise<PersonaAssetUpdate>>,
  maxConcurrency: number,
  signal: AbortSignal | undefined,
  onComplete: (update: PersonaAssetUpdate) => void,
) {
  let cursor = 0
  const workerCount = Math.max(1, Math.min(maxConcurrency, tasks.length))

  async function worker() {
    for (;;) {
      throwIfAborted(signal)
      const task = tasks[cursor]
      cursor += 1

      if (!task) {
        return
      }

      const update = await task()
      throwIfAborted(signal)
      onComplete(update)
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()))
}

function applyAssetUpdate(persona: PersonaBrand, update: PersonaAssetUpdate) {
  Object.assign(persona, update.value)
}

function pickIdentity(identity: PersonaTextIdentity): Pick<PersonaBrand, 'nickname' | 'nicknames' | 'username'> {
  return {
    nickname: identity.nickname,
    nicknames: identity.nicknames,
    username: identity.username,
  }
}

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
  const signatureBase = createLocalSignature(keywords, configs.signature, context)
  const signature = fitTextLength(signatureBase, signatureLengthRange[configs.signature.length])
  const bioBase = createLocalBio(base, keyLine, configs.bio, context)
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
  config: AssetConfigState['signature'],
  context: GenerationContext,
) {
  const subject = keywords[1] ?? keywords[0] ?? '灵感'
  const perspective = context.perspective.trim().replace(/[。！!？?]+$/, '')
  const structureCopy = {
    value: `让${subject}真正用起来，而不是停在概念里`,
    expertise: `把${subject}里的难题讲清楚、做扎实`,
    attitude: `${subject}不靠口号，靠一次次具体实践`,
    hybrid: `把${subject}做明白，也做扎实`,
  } satisfies Record<AssetConfigState['signature']['structure'], string>
  const tonePrefix = {
    professional: '',
    friendly: '和你一起，',
    bold: '拒绝平庸，',
  } satisfies Record<AssetConfigState['signature']['tone'], string>

  const copy = perspective || structureCopy[config.structure]
  return `${tonePrefix[config.tone]}${copy}${config.allowEmoji ? ' ✦' : ''}`
}

function createLocalBio(
  base: string,
  keyLine: string,
  config: AssetConfigState['bio'],
  context: GenerationContext,
) {
  const subject = config.voice === 'first-person' ? '我' : base
  const experience = context.experience.trim() || keyLine
  const proof = context.proofPoints.trim()
  const perspective = context.perspective.trim()
  const sections = config.emphasis.map((emphasis) => {
    const copy = {
      identity: `${subject}在做${experience}`,
      expertise: `工作重点是${keyLine}，更在意方法能不能落到真实场景`,
      value: perspective || `希望给${context.audience}带来更具体、可执行的参考`,
      proof: proof ? `可验证的经历与成果包括：${proof}` : '不把没有依据的经历和成绩写进介绍里',
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

function buildGroundedBrief(
  form: PersonaForm | PersonaGenerationParams,
  context: GenerationContext,
) {
  const facts = [
    `核心定位：${form.prompt.trim() || '未提供'}`,
    `目标受众：${context.audience || '未提供'}`,
    context.experience ? `真实经历或项目：${context.experience}` : '真实经历或项目：未提供，不得自行补写。',
    context.proofPoints ? `可验证成果：${context.proofPoints}` : '可验证成果：未提供，不得使用数字、客户或成绩来充实文案。',
    context.perspective ? `个人观点：${context.perspective}` : '',
    context.writingSample ? `本人表达样本（参考节奏和用词，不得照抄）：${context.writingSample}` : '',
    context.requiredKeywords ? `必须自然出现：${context.requiredKeywords}` : '',
    context.excludedKeywords ? `禁止出现：${context.excludedKeywords}` : '',
    context.avoidPhrases ? `禁用套话：${context.avoidPhrases}` : '',
    `品牌语气：${context.brandVoice.map((voice) => voiceLabelMap[voice]).join('、')}`,
    `输出语言：${languageLabelMap[context.language]}`,
  ].filter(Boolean)

  return [
    '以下是唯一可据以陈述的 Persona Brief：',
    ...facts,
    '',
    '写作原则：具体名词和动作优先于抽象评价；句式有变化；没有证据时宁可不说；不要使用“专注于、致力于、持续探索、赋能、让价值被看见、把复杂变简单”等 AI 套话。',
  ].join('\n')
}

function buildAvatarBrief(
  form: PersonaForm | PersonaGenerationParams,
  context: GenerationContext,
) {
  return [
    `人物定位：${form.prompt.trim() || '个人品牌创作者'}`,
    context.experience ? `职业线索：${context.experience}` : '',
    context.perspective ? `人物气质：${context.perspective}` : '',
    `整体风格：${styleLabelMap[form.style]}`,
    '只生成可识别的人物视觉形象，不要文字、logo、水印或虚构奖项元素。',
  ].filter(Boolean).join('\n')
}

function getCopyQualityIssues(copy: string, context: GenerationContext) {
  const phrases = [
    ...splitPhrases(context.avoidPhrases),
    '专注于',
    '致力于',
    '持续探索',
    '赋能',
    '让价值被看见',
    '把复杂变简单',
    '有温度的表达',
  ]
  const hits = [...new Set(phrases.filter((phrase) => phrase && copy.includes(phrase)))]
  const issues: string[] = []

  if (hits.length) {
    issues.push(`包含禁用或模板化表达：${hits.join('、')}`)
  }

  if (/(我们|我们团队|客户|服务过|累计|\d+\s*(家|万|年|次|%)|获奖)/.test(copy) && !context.experience && !context.proofPoints) {
    issues.push('在未提供事实依据时出现了可能的虚构背书')
  }

  return issues
}

function splitPhrases(input: string) {
  return input.split(/[,，、\n/]+/).map((item) => item.trim()).filter(Boolean)
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
      if (isAbortError(error) || (error instanceof AIServiceError && !error.retryable) || attempt === retryCount) {
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

  const payload = await response.json().catch(() => null) as { error?: { code?: string } } | null
  const errorCode = payload?.error?.code
  const retryableCodes = ['AI_PROVIDER_BUSY', 'AI_PROVIDER_ERROR', 'AI_PROVIDER_TIMEOUT', 'AI_PROVIDER_UNREACHABLE']
  const retryable = errorCode
    ? retryableCodes.includes(errorCode)
    : [408, 425, 429, 500, 502, 503, 504].includes(response.status)

  throw new AIServiceError(
    getPublicErrorMessage(response.status, errorCode),
    'provider',
    undefined,
    retryable,
  )
}

function getPublicErrorMessage(status: number, errorCode?: string) {
  if (errorCode?.includes('CONFIG') || errorCode === 'AI_PROVIDER_AUTH_ERROR') {
    return 'AI 服务配置异常，请联系管理员'
  }

  if (errorCode === 'AI_PROVIDER_TIMEOUT' || status === 504) {
    return 'AI 服务响应超时，请稍后重试'
  }

  if (errorCode === 'AI_PROVIDER_BUSY' || status === 429) {
    return 'AI 服务当前繁忙，请稍后重试'
  }

  if (status === 400 || status === 422) {
    return '生成参数不符合要求，请调整后重试'
  }

  if (status === 404) {
    return 'AI 服务暂时不可用，请联系管理员'
  }

  return '生成失败，请稍后重试'
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

  return new AIServiceError('无法连接 AI 服务，请检查网络后重试', 'network', error)
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
