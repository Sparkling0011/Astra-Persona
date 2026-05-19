import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import {
  generatePersona as requestGeneratePersona,
  regeneratePersonaSection,
} from '@/api/persona'
import {
  createShareLink,
  downloadBlob,
  exportPersonaZip,
} from '@/services/exportService'
import type {
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
    const history = ref<Persona[]>(legacySnapshot?.brands ?? [])
    const currentPersonaId = ref(
      legacySnapshot?.activeBrandId ?? history.value[0]?.id ?? '',
    )
    const promptHistory = ref<PromptHistoryItem[]>([])
    const isHistoryOpen = ref(false)
    const isLoading = ref(false)
    const loadingMessage = ref('')
    const generatingSection = ref<PersonaSection | 'brand' | null>(null)
    const progress = ref(0)
    const error = ref('')
    const lastFailedPart = ref<PersonaSection | 'brand' | null>(null)
    const shareUrl = ref('')
    const shareQrCodeDataUrl = ref('')
    let progressTimer: number | undefined

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
      }

      beginGeneration('brand', '正在生成身份资产')
      addPromptHistory(form.value)

      try {
        debugger
        const persona = normalizePersona(
          await requestGeneratePersona(params.value),
          params.value,
        )
        upsertPersona(persona)
        currentPersonaId.value = persona.id
        finishGeneration()
        return persona
      } catch (caughtError) {
        failGeneration(caughtError, 'brand')
        return undefined
      }
    }

    async function createPersona() {
      return generatePersona()
    }

    async function retryPart(
      section: PersonaSection = lastFailedPart.value === 'avatar' ||
      lastFailedPart.value === 'signature' ||
      lastFailedPart.value === 'bio'
        ? lastFailedPart.value
        : 'avatar',
    ) {
      if (!currentPersona.value) {
        return undefined
      }

      beginGeneration(section, retryMessage(section))

      try {
        const updatedPersona = normalizePersona(
          await regeneratePersonaSection(currentPersona.value, section),
          currentPersona.value.params,
        )
        upsertPersona(updatedPersona)
        currentPersonaId.value = updatedPersona.id
        finishGeneration()
        return updatedPersona
      } catch (caughtError) {
        failGeneration(caughtError, section)
        return undefined
      }
    }

    async function regenerateSection(section: PersonaSection) {
      return retryPart(section)
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
      currentPersonaId.value = personaId
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
        `${persona.username.replace('@', '') || 'persona'}-asset-kit.zip`,
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
      stopProgressTimer()
      isLoading.value = true
      loadingMessage.value = message
      generatingSection.value = section
      error.value = ''
      progress.value = 8
      progressTimer = window.setInterval(() => {
        progress.value = Math.min(progress.value + Math.random() * 14, 86)
      }, 260)
    }

    function finishGeneration() {
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
      stopGeneration()
    }

    function stopGeneration() {
      stopProgressTimer()
      isLoading.value = false
      loadingMessage.value = ''
      generatingSection.value = null
      progress.value = 0
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

    return {
      form,
      params,
      history,
      promptHistory,
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
      shareUrl,
      shareQrCodeDataUrl,
      generatePersona,
      createPersona,
      retryPart,
      regenerateSection,
      updateParams,
      setPrompt,
      addPromptHistory,
      clearPromptHistory,
      selectAvatar,
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
    }
  },
  {
    persist: {
      key: 'ai-persona-app-state',
      pick: ['form', 'params', 'history', 'currentPersonaId', 'promptHistory'],
    },
  },
)

function normalizePersona(
  persona: Persona,
  params: PersonaGenerationParams,
): Persona {
  const selectedAvatar =
    persona.avatars.find((avatar) => avatar.id === persona.selectedAvatarId) ??
    persona.avatars[0]

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
    params: {
      ...params,
      prompt: persona.prompt,
      style: persona.style,
    },
  }
}

function retryMessage(section: PersonaSection) {
  const messages: Record<PersonaSection, string> = {
    avatar: '正在重新生成头像',
    signature: '正在重新生成签名',
    bio: '正在重新生成简介',
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
