import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import {
  generatePersona as requestGeneratePersona,
  regeneratePersonaSection,
} from '@/api/persona'
import { createDefaultAssetConfigs, createDefaultGenerationContext, scenarioPresets } from '@/constants/assets'
import {
  createShareLink,
  downloadBlob,
  exportPersonaZip,
} from '@/services/exportService'
import { createId } from '@/utils/id'
import type {
  AssetConfigState,
  AssetType,
  GenerationContext,
  Persona,
  PersonaForm,
  PersonaGenerationParams,
  PersonaSection,
  PromptHistoryItem,
} from '@/types/persona'

const initialForm: PersonaForm = {
  prompt: 'AI 设计师 温柔 科技感 内容创作者',
  style: 'cyberpunk',
}

const initialParams: PersonaGenerationParams = {
  ...initialForm,
  imageCount: 3,
  imageSize: '1024x1024',
  creativity: 0.75,
  outputLanguage: 'zh-CN',
}

const historyLimit = 40
const promptHistoryLimit = 30

interface LegacySnapshot {
  form?: PersonaForm
  brands?: Persona[]
  activeBrandId?: string
}

export const usePersonaStore = defineStore(
  'persona',
  () => {
    const legacySnapshot = readLegacySnapshot()

    const form = ref<PersonaForm>(legacySnapshot?.form ?? { ...initialForm })
    const params = ref<PersonaGenerationParams>({
      ...initialParams,
      ...form.value,
    })
    const history = ref<Persona[]>(
      (legacySnapshot?.brands ?? []).map((persona) =>
        normalizePersona(persona, persona.params ?? initialParams),
      ),
    )
    const currentPersonaId = ref(
      legacySnapshot?.activeBrandId ?? history.value[0]?.id ?? '',
    )
    const promptHistory = ref<PromptHistoryItem[]>([])
    const selectedAssetTypes = ref<AssetType[]>(['identity', 'avatar', 'signature', 'bio', 'tags'])
    const assetConfigs = ref<AssetConfigState>(createDefaultAssetConfigs())
    const generationContext = ref<GenerationContext>(createDefaultGenerationContext())
    const isHistoryOpen = ref(false)
    const isLoading = ref(false)
    const loadingMessage = ref('')
    const generatingSection = ref<PersonaSection | 'brand' | null>(null)
    const progress = ref(0)
    const error = ref('')
    const lastFailedPart = ref<PersonaSection | 'brand' | null>(null)
    const generationOutcome = ref<'idle' | 'loading' | 'success' | 'failed'>('idle')
    const shareUrl = ref('')
    const shareQrCodeDataUrl = ref('')
    let progressTimer: number | undefined
    let activeGenerationController: AbortController | undefined

    const currentPersona = computed(
      () =>
        history.value.find(
          (persona) => persona.id === currentPersonaId.value,
        ) ?? history.value[0],
    )
    const activePersona = currentPersona
    const activeBrand = currentPersona
    const latestPersona = currentPersona
    const brands = history
    const personas = history
    const activeBrandId = currentPersonaId
    const isGenerating = isLoading
    const errorMessage = error

    importSharedPersonaFromUrl()
    window.setTimeout(() => {
      const hasLegacyAssetConfig = !('identity' in assetConfigs.value)
      assetConfigs.value = normalizeAssetConfigState(assetConfigs.value)
      generationContext.value = normalizeGenerationContext(generationContext.value)

      if (hasLegacyAssetConfig && !selectedAssetTypes.value.includes('identity')) {
        selectedAssetTypes.value = ['identity', ...selectedAssetTypes.value]
      }
    }, 0)

    async function generatePersona(
      overrides?: Partial<PersonaGenerationParams>,
    ) {
      if (overrides) {
        updateParams(overrides)
      }

      params.value = {
        ...params.value,
        prompt: form.value.prompt,
        style: form.value.style,
        imageCount: assetConfigs.value.avatar.imageCount,
        imageSize: assetConfigs.value.avatar.imageSize,
        assetTypes: ['identity', 'avatar', 'signature', 'bio', 'tags'],
        assetConfigs: cloneAssetConfigs(assetConfigs.value),
        generationContext: cloneGenerationContext(generationContext.value),
        outputLanguage: generationContext.value.language === 'en-US' ? 'en-US' : 'zh-CN',
      }

      const signal = beginGeneration('brand', '正在生成个人品牌内容')
      addPromptHistory(form.value)

      try {
        const persona = normalizePersona(
          await requestGeneratePersona(params.value, signal),
          params.value,
        )
        const nextPersona = withGenerationSnapshot(persona, ['identity', 'avatar', 'signature', 'bio', 'tags'], assetConfigs.value, generationContext.value)
        upsertPersona(nextPersona)
        currentPersonaId.value = nextPersona.id
        finishGeneration()
        return nextPersona
      } catch (caughtError) {
        if (signal.aborted) {
          return undefined
        }
        failGeneration(caughtError, 'brand')
        return undefined
      }
    }

    async function createPersona() {
      return generateSelectedAssets()
    }

    async function generateSelectedAssets() {
      params.value = {
        ...params.value,
        prompt: form.value.prompt,
        style: form.value.style,
        imageCount: assetConfigs.value.avatar.imageCount,
        imageSize: assetConfigs.value.avatar.imageSize,
        assetTypes: [...selectedAssetTypes.value],
        assetConfigs: cloneAssetConfigs(assetConfigs.value),
        generationContext: cloneGenerationContext(generationContext.value),
        outputLanguage: generationContext.value.language === 'en-US' ? 'en-US' : 'zh-CN',
      }

      const signal = beginGeneration('brand', `正在生成 ${selectedAssetTypes.value.length} 项内容`)
      addPromptHistory(form.value)

      try {
        const generatedPersona = normalizePersona(
          await requestGeneratePersona(params.value, signal),
          params.value,
        )
        const nextPersona = mergeSelectedAssets(
          currentPersona.value,
          generatedPersona,
          selectedAssetTypes.value,
        )
        const personaWithSnapshot = withGenerationSnapshot(
          createHistoryEntry(nextPersona),
          selectedAssetTypes.value,
          assetConfigs.value,
          generationContext.value,
        )

        upsertPersona(personaWithSnapshot)
        currentPersonaId.value = personaWithSnapshot.id
        finishGeneration()
        return personaWithSnapshot
      } catch (caughtError) {
        if (signal.aborted) {
          return undefined
        }
        failGeneration(caughtError, 'brand')
        return undefined
      }
    }

    async function retryPart(
      section: PersonaSection = lastFailedPart.value && lastFailedPart.value !== 'brand'
        ? lastFailedPart.value
        : 'avatar',
    ) {
      if (!currentPersona.value) {
        return undefined
      }

      const signal = beginGeneration(section, retryMessage(section))

      try {
        const updatedPersona = withGenerationSnapshot(
          normalizePersona(
            await regeneratePersonaSection(currentPersona.value, section, signal),
            currentPersona.value.params,
          ),
          getPersonaAssetTypes(currentPersona.value),
          getPersonaAssetConfigs(currentPersona.value),
          getPersonaGenerationContext(currentPersona.value),
        )
        upsertPersona(updatedPersona)
        currentPersonaId.value = updatedPersona.id
        finishGeneration()
        return updatedPersona
      } catch (caughtError) {
        if (signal.aborted) {
          return undefined
        }
        failGeneration(caughtError, section)
        return undefined
      }
    }

    async function regenerateSection(section: PersonaSection) {
      return retryPart(section)
    }

    async function regenerateAsset(type: AssetType) {
      if (!currentPersona.value) {
        return undefined
      }

      const section = assetToPersonaSection(type)
      const signal = beginGeneration(section, assetRetryMessage(type))

      try {
        const updatedPersona = normalizePersona(
          await regeneratePersonaSection(currentPersona.value, section, signal),
          currentPersona.value.params,
        )
        const nextPersona = withGenerationSnapshot(
          mergeSelectedAssets(currentPersona.value, updatedPersona, [type]),
          getPersonaAssetTypes(currentPersona.value),
          getPersonaAssetConfigs(currentPersona.value),
          getPersonaGenerationContext(currentPersona.value),
        )
        upsertPersona(nextPersona)
        currentPersonaId.value = nextPersona.id
        finishGeneration()
        return nextPersona
      } catch (caughtError) {
        if (signal.aborted) {
          return undefined
        }
        failGeneration(caughtError, section)
        return undefined
      }
    }

    function updateParams(nextParams: Partial<PersonaGenerationParams>) {
      params.value = {
        ...params.value,
        ...nextParams,
      }

      form.value = {
        prompt: params.value.prompt,
        style: params.value.style,
      }
    }

    function setPrompt(prompt: string) {
      updateParams({ prompt })
    }

    function toggleAssetType(type: AssetType) {
      if (selectedAssetTypes.value.includes(type)) {
        if (selectedAssetTypes.value.length === 1) {
          return
        }

        selectedAssetTypes.value = selectedAssetTypes.value.filter((item) => item !== type)
        return
      }

      selectedAssetTypes.value = [...selectedAssetTypes.value, type]
    }

    function updateAssetConfig<T extends AssetType>(type: T, nextConfig: Partial<AssetConfigState[T]>) {
      assetConfigs.value = {
        ...assetConfigs.value,
        [type]: {
          ...assetConfigs.value[type],
          ...nextConfig,
        },
      }

      if (type === 'avatar') {
        updateParams({
          imageCount: assetConfigs.value.avatar.imageCount,
          imageSize: assetConfigs.value.avatar.imageSize,
        })
      }
    }

    function updateAssetField(type: AssetType, key: string, value: unknown) {
      const currentConfig = assetConfigs.value[type] as unknown as Record<string, unknown>
      updateAssetConfig(type, { ...currentConfig, [key]: value } as AssetConfigState[typeof type])
    }

    function updateGenerationContext(nextContext: Partial<GenerationContext>) {
      generationContext.value = {
        ...generationContext.value,
        ...nextContext,
      }
    }

    function applyScenarioPreset(presetId: string) {
      const preset = scenarioPresets.find((item) => item.id === presetId)

      if (!preset) {
        return
      }

      selectedAssetTypes.value = [...preset.assetTypes]
      form.value.style = preset.style
      params.value.style = preset.style
      updateGenerationContext(preset.context)
      assetConfigs.value = normalizeAssetConfigState({
        ...assetConfigs.value,
        identity: { ...assetConfigs.value.identity, ...preset.assetConfigs?.identity },
        avatar: { ...assetConfigs.value.avatar, ...preset.assetConfigs?.avatar },
        signature: { ...assetConfigs.value.signature, ...preset.assetConfigs?.signature },
        bio: { ...assetConfigs.value.bio, ...preset.assetConfigs?.bio },
        tags: { ...assetConfigs.value.tags, ...preset.assetConfigs?.tags },
      })
      updateParams({
        imageCount: assetConfigs.value.avatar.imageCount,
        imageSize: assetConfigs.value.avatar.imageSize,
      })
    }

    function addPromptHistory(nextForm: PersonaForm) {
      const prompt = nextForm.prompt.trim()

      if (!prompt) {
        return
      }

      promptHistory.value = [
        {
          id: crypto.randomUUID(),
          prompt,
          style: nextForm.style,
          createdAt: new Date().toISOString(),
        },
        ...promptHistory.value.filter(
          (item) => item.prompt !== prompt || item.style !== nextForm.style,
        ),
      ].slice(0, promptHistoryLimit)
    }

    function clearPromptHistory() {
      promptHistory.value = []
    }

    function selectAvatar(avatarId: string) {
      if (!currentPersona.value) {
        return
      }

      const selectedAvatar = currentPersona.value.avatars.find(
        (avatar) => avatar.id === avatarId,
      )

      replacePersona({
        ...currentPersona.value,
        selectedAvatarId: avatarId,
        avatarUrl: selectedAvatar?.url ?? currentPersona.value.avatarUrl,
        updatedAt: new Date().toISOString(),
      })
    }

    function selectNickname(nickname: string) {
      if (!currentPersona.value || !currentPersona.value.nicknames.includes(nickname)) {
        return
      }

      replacePersona({
        ...currentPersona.value,
        nickname,
        updatedAt: new Date().toISOString(),
      })
    }

    function updateAvatar(avatarId: string, url: string) {
      if (!currentPersona.value) {
        return
      }

      const avatars = currentPersona.value.avatars.map((avatar) =>
        avatar.id === avatarId
          ? {
              ...avatar,
              url,
              editedAt: new Date().toISOString(),
            }
          : avatar,
      )

      replacePersona({
        ...currentPersona.value,
        avatars,
        avatarUrl: url,
        avatarUrls: avatars.map((avatar) => avatar.url),
        selectedAvatarId: avatarId,
        updatedAt: new Date().toISOString(),
      })
    }

    function addAvatarVariant(url: string, label = '编辑版') {
      if (!currentPersona.value) {
        return
      }

      const avatarId = crypto.randomUUID()
      const avatars = [
        {
          id: avatarId,
          url,
          label,
          editedAt: new Date().toISOString(),
        },
        ...currentPersona.value.avatars,
      ].slice(0, 6)

      replacePersona({
        ...currentPersona.value,
        avatars,
        avatarUrl: url,
        avatarUrls: avatars.map((avatar) => avatar.url),
        selectedAvatarId: avatarId,
        updatedAt: new Date().toISOString(),
      })
    }

    function selectPersona(personaId: string) {
      const persona = history.value.find((item) => item.id === personaId)

      if (!persona) {
        return
      }

      currentPersonaId.value = personaId
      restoreWorkspaceFromPersona(persona)
      generationOutcome.value = 'idle'
      clearError()
      isHistoryOpen.value = false
    }

    function selectBrand(brandId: string) {
      selectPersona(brandId)
    }

    function removePersona(personaId: string) {
      history.value = history.value.filter(
        (persona) => persona.id !== personaId,
      )

      if (currentPersonaId.value === personaId) {
        currentPersonaId.value = history.value[0]?.id ?? ''
      }
    }

    function removeBrand(brandId: string) {
      removePersona(brandId)
    }

    async function exportKit(personaId = currentPersonaId.value) {
      const persona = history.value.find((item) => item.id === personaId)

      if (!persona) {
        error.value = '没有可导出的 Persona'
        return undefined
      }

      const zipBlob = await exportPersonaZip(persona)
      downloadBlob(
        `${persona.username.replace('@', '') || 'persona'}-brand-kit.zip`,
        zipBlob,
      )
      return zipBlob
    }

    async function createShare(personaId = currentPersonaId.value) {
      const persona = history.value.find((item) => item.id === personaId)

      if (!persona) {
        error.value = '没有可分享的 Persona'
        return undefined
      }

      const payload = await createShareLink(persona)
      shareUrl.value = payload.url
      shareQrCodeDataUrl.value = payload.qrCodeDataUrl
      return payload
    }

    function toggleHistory() {
      isHistoryOpen.value = !isHistoryOpen.value
    }

    function closeHistory() {
      isHistoryOpen.value = false
    }

    function resetForm() {
      updateParams(initialParams)
      selectedAssetTypes.value = ['identity', 'avatar', 'signature', 'bio', 'tags']
      assetConfigs.value = createDefaultAssetConfigs()
      generationContext.value = createDefaultGenerationContext()
    }

    function clearError() {
      error.value = ''
      lastFailedPart.value = null
    }

    function importSharedPersonaFromUrl() {
      const shareId = new URLSearchParams(window.location.search).get('share')

      if (!shareId) {
        return
      }

      try {
        const raw = localStorage.getItem(shareId)

        if (!raw) {
          return
        }

        const parsed = JSON.parse(raw) as { persona?: Persona }

        if (!parsed.persona) {
          return
        }

        upsertPersona(normalizePersona(parsed.persona, parsed.persona.params))
        currentPersonaId.value = parsed.persona.id
      } catch {
        error.value = '分享链接解析失败'
      }
    }

    function beginGeneration(
      section: PersonaSection | 'brand',
      message: string,
    ) {
      activeGenerationController?.abort()
      activeGenerationController = new AbortController()
      stopProgressTimer()
      isLoading.value = true
      loadingMessage.value = message
      generatingSection.value = section
      error.value = ''
      progress.value = 8
      if (section === 'brand') {
        generationOutcome.value = 'loading'
      }
      // The provider only returns final results, so this keeps the UI responsive while the request is pending.
      progressTimer = window.setInterval(() => {
        progress.value = Math.min(progress.value + Math.random() * 14, 86)
      }, 260)
      return activeGenerationController.signal
    }

    function finishGeneration() {
      if (generatingSection.value === 'brand') {
        generationOutcome.value = 'success'
      }
      progress.value = 100
      window.setTimeout(() => {
        stopGeneration()
      }, 360)
    }

    function failGeneration(
      caughtError: unknown,
      section: PersonaSection | 'brand',
    ) {
      error.value =
        caughtError instanceof Error
          ? caughtError.message
          : '生成失败，请稍后重试'
      lastFailedPart.value = section
      if (section === 'brand') {
        generationOutcome.value = 'failed'
      }
      stopGeneration()
    }

    function stopGeneration() {
      stopProgressTimer()
      isLoading.value = false
      loadingMessage.value = ''
      generatingSection.value = null
      progress.value = 0
      activeGenerationController = undefined
    }

    function cancelGeneration() {
      activeGenerationController?.abort()
      if (generatingSection.value === 'brand') {
        generationOutcome.value = 'idle'
      }
      stopGeneration()
    }

    function stopProgressTimer() {
      if (progressTimer) {
        window.clearInterval(progressTimer)
        progressTimer = undefined
      }
    }

    function upsertPersona(persona: Persona) {
      history.value = [
        persona,
        ...history.value.filter((item) => item.id !== persona.id),
      ].slice(0, historyLimit)
    }

    function replacePersona(nextPersona: Persona) {
      history.value = history.value.map((persona) =>
        persona.id === nextPersona.id ? nextPersona : persona,
      )
      currentPersonaId.value = nextPersona.id
    }

    function restoreWorkspaceFromPersona(persona: Persona) {
      const nextAssetTypes = getPersonaAssetTypes(persona)
      const nextAssetConfigs = getPersonaAssetConfigs(persona)

      selectedAssetTypes.value = nextAssetTypes
      assetConfigs.value = nextAssetConfigs
      generationContext.value = getPersonaGenerationContext(persona)
      params.value = {
        ...initialParams,
        ...persona.params,
        prompt: persona.prompt,
        style: persona.style,
        imageCount: nextAssetConfigs.avatar.imageCount,
        imageSize: nextAssetConfigs.avatar.imageSize,
        assetTypes: nextAssetTypes,
        assetConfigs: cloneAssetConfigs(nextAssetConfigs),
        generationContext: cloneGenerationContext(generationContext.value),
      }
      form.value = {
        prompt: persona.prompt,
        style: persona.style,
      }
    }

    return {
      form,
      params,
      history,
      promptHistory,
      selectedAssetTypes,
      assetConfigs,
      generationContext,
      currentPersona,
      activePersona,
      activeBrand,
      latestPersona,
      currentPersonaId,
      activeBrandId,
      brands,
      personas,
      isHistoryOpen,
      isLoading,
      isGenerating,
      loadingMessage,
      generatingSection,
      progress,
      error,
      errorMessage,
      lastFailedPart,
      generationOutcome,
      shareUrl,
      shareQrCodeDataUrl,
      generatePersona,
      createPersona,
      generateSelectedAssets,
      retryPart,
      regenerateSection,
      regenerateAsset,
      updateParams,
      setPrompt,
      toggleAssetType,
      updateAssetConfig,
      updateAssetField,
      updateGenerationContext,
      applyScenarioPreset,
      addPromptHistory,
      clearPromptHistory,
      selectAvatar,
      selectNickname,
      updateAvatar,
      addAvatarVariant,
      selectPersona,
      selectBrand,
      removePersona,
      removeBrand,
      exportKit,
      createShare,
      toggleHistory,
      closeHistory,
      resetForm,
      clearError,
      cancelGeneration,
    }
  },
  {
    persist: {
      key: 'ai-persona-app-state',
      pick: ['form', 'params', 'history', 'currentPersonaId', 'promptHistory', 'selectedAssetTypes', 'assetConfigs', 'generationContext'],
    },
  },
)

function mergeSelectedAssets(existingPersona: Persona | undefined, generatedPersona: Persona, selectedTypes: AssetType[]): Persona {
  const selected = new Set(selectedTypes)
  const base = existingPersona ?? generatedPersona
  const avatarSource = selected.has('avatar') ? generatedPersona : base
  const identitySource = selected.has('identity') ? generatedPersona : base
  const signatureSource = selected.has('signature') ? generatedPersona : base
  const bioSource = selected.has('bio') ? generatedPersona : base
  const tagSource = selected.has('tags') ? generatedPersona : base

  return {
    ...base,
    prompt: generatedPersona.prompt,
    style: generatedPersona.style,
    params: generatedPersona.params,
    avatars: avatarSource.avatars,
    avatarUrl: avatarSource.avatarUrl,
    avatarUrls: avatarSource.avatarUrls,
    selectedAvatarId: avatarSource.selectedAvatarId,
    nickname: identitySource.nickname,
    username: identitySource.username,
    nicknames: identitySource.nicknames,
    signature: signatureSource.signature,
    bio: bioSource.bio,
    bios: bioSource.bios,
    tags: tagSource.tags,
    updatedAt: new Date().toISOString(),
  }
}

function createHistoryEntry(persona: Persona): Persona {
  const now = new Date().toISOString()

  return {
    ...persona,
    id: createId('brand'),
    createdAt: now,
    updatedAt: now,
  }
}

function assetToPersonaSection(type: AssetType): PersonaSection {
  return type
}

function assetRetryMessage(type: AssetType) {
  const messages: Record<AssetType, string> = {
    identity: '正在重新生成名称',
    avatar: '正在重新生成头像',
    signature: '正在重新生成签名',
    bio: '正在重新生成简介',
    tags: '正在重新生成关键词',
  }

  return messages[type]
}

function normalizePersona(
  persona: Persona,
  params: PersonaGenerationParams,
): Persona {
  const selectedAvatar =
    persona.avatars.find((avatar) => avatar.id === persona.selectedAvatarId) ??
    persona.avatars[0]
  const normalizedAssetTypes = getPersonaAssetTypes(persona)
  const normalizedAssetConfigs = getPersonaAssetConfigs(persona)
  const normalizedContext = getPersonaGenerationContext(persona)

  return {
    ...persona,
    avatarUrl: persona.avatarUrl || selectedAvatar?.url || '',
    avatarUrls: persona.avatarUrls?.length
      ? persona.avatarUrls
      : persona.avatars.map((avatar) => avatar.url),
    nicknames: persona.nicknames?.length
      ? persona.nicknames
      : [persona.nickname, persona.username].filter(Boolean),
    bio: persona.bio || persona.bios[0]?.content || '',
    assetTypes: normalizedAssetTypes,
    assetConfigs: normalizedAssetConfigs,
    generationContext: normalizedContext,
    params: {
      ...params,
      prompt: persona.prompt,
      style: persona.style,
      assetTypes: normalizedAssetTypes,
      assetConfigs: normalizedAssetConfigs,
      generationContext: normalizedContext,
    },
  }
}

function withGenerationSnapshot(
  persona: Persona,
  assetTypes: AssetType[],
  configs: AssetConfigState,
  context: GenerationContext,
): Persona {
  const assetConfigSnapshot = cloneAssetConfigs(configs)
  const contextSnapshot = cloneGenerationContext(context)

  return {
    ...persona,
    assetTypes: [...assetTypes],
    assetConfigs: assetConfigSnapshot,
    generationContext: contextSnapshot,
    params: {
      ...persona.params,
      imageCount: assetConfigSnapshot.avatar.imageCount,
      imageSize: assetConfigSnapshot.avatar.imageSize,
      assetTypes: [...assetTypes],
      assetConfigs: assetConfigSnapshot,
      generationContext: contextSnapshot,
      outputLanguage: contextSnapshot.language === 'en-US' ? 'en-US' : 'zh-CN',
    },
  }
}

function getPersonaAssetTypes(persona: Persona): AssetType[] {
  if (persona.assetTypes?.length) {
    const savedTypes = [...persona.assetTypes]

    // Older snapshots stored names together with signatures; migrate them into the new identity asset.
    if ((persona.nickname || persona.username) && !savedTypes.includes('identity')) {
      savedTypes.unshift('identity')
    }

    return savedTypes
  }

  const inferredTypes: AssetType[] = []

  if (persona.avatars?.length || persona.avatarUrl) {
    inferredTypes.push('avatar')
  }

  if (persona.nickname || persona.username) {
    inferredTypes.push('identity')
  }

  if (persona.signature) {
    inferredTypes.push('signature')
  }

  if (persona.bio || persona.bios?.length) {
    inferredTypes.push('bio')
  }

  if (persona.tags?.length) {
    inferredTypes.push('tags')
  }

  return inferredTypes.length ? inferredTypes : ['identity', 'avatar', 'signature', 'bio', 'tags']
}

function getPersonaAssetConfigs(persona: Persona): AssetConfigState {
  const savedConfigs = persona.assetConfigs
  const normalized = normalizeAssetConfigState(savedConfigs)
  normalized.avatar.imageCount = savedConfigs?.avatar?.imageCount ?? persona.params?.imageCount ?? normalized.avatar.imageCount
  normalized.avatar.imageSize = savedConfigs?.avatar?.imageSize ?? persona.params?.imageSize ?? normalized.avatar.imageSize
  return normalized
}

function normalizeAssetConfigState(saved?: Partial<AssetConfigState>): AssetConfigState {
  const defaults = createDefaultAssetConfigs()

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

function cloneAssetConfigs(configs: AssetConfigState): AssetConfigState {
  return {
    identity: { ...configs.identity },
    avatar: { ...configs.avatar },
    signature: { ...configs.signature },
    bio: { ...configs.bio, emphasis: [...configs.bio.emphasis] },
    tags: { ...configs.tags, categories: [...configs.tags.categories] },
  }
}

function getPersonaGenerationContext(persona: Persona): GenerationContext {
  return normalizeGenerationContext({
    ...persona.generationContext,
    ...persona.params?.generationContext,
  })
}

function normalizeGenerationContext(saved?: Partial<GenerationContext>): GenerationContext {
  const defaults = createDefaultGenerationContext()
  return {
    ...defaults,
    ...saved,
    brandVoice: [...(saved?.brandVoice ?? defaults.brandVoice)],
  }
}

function cloneGenerationContext(context: GenerationContext): GenerationContext {
  return {
    ...context,
    brandVoice: [...context.brandVoice],
  }
}

function retryMessage(section: PersonaSection) {
  const messages: Record<PersonaSection, string> = {
    identity: '正在重新生成名称',
    avatar: '正在重新生成头像',
    signature: '正在重新生成签名',
    bio: '正在重新生成简介',
    tags: '正在重新生成关键词',
  }

  return messages[section]
}

function readLegacySnapshot(): LegacySnapshot | null {
  try {
    const raw = localStorage.getItem('ai-persona-generator-state')

    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as LegacySnapshot

    if (!Array.isArray(parsed.brands) || !parsed.form) {
      return null
    }

    return parsed
  } catch {
    return null
  }
}
