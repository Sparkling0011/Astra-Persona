import { computed, onBeforeUnmount, ref } from 'vue'

import { aiService, type CompletePersonaOptions, type ImageProgress, type TextGenerationOptions } from '@/services/aiService'
import type { PersonaBrand, PersonaForm } from '@/types/persona'

export function useAI() {
  const controller = ref<AbortController | null>(null)
  const isGenerating = ref(false)
  const streamedText = ref('')
  const imageProgress = ref<ImageProgress>({ status: 'queued', progress: 0 })
  const errorMessage = ref('')

  const canCancel = computed(() => Boolean(controller.value) && isGenerating.value)

  function createController() {
    controller.value?.abort()
    controller.value = new AbortController()
    errorMessage.value = ''
    streamedText.value = ''
    imageProgress.value = { status: 'queued', progress: 0 }
    return controller.value
  }

  async function generateText(options: Omit<TextGenerationOptions, 'signal' | 'onDelta'>) {
    const activeController = createController()
    isGenerating.value = true

    try {
      return await aiService.generateText({
        ...options,
        signal: activeController.signal,
        onDelta: (_delta, fullText) => {
          streamedText.value = fullText
        },
      })
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '文本生成失败'
      throw error
    } finally {
      isGenerating.value = false
    }
  }

  async function generateCompletePersona(form: PersonaForm): Promise<PersonaBrand> {
    const activeController = createController()
    isGenerating.value = true

    try {
      const options: CompletePersonaOptions = {
        form,
        signal: activeController.signal,
        onTextDelta: (_delta, fullText) => {
          streamedText.value = fullText
        },
        onImageProgress: (progress) => {
          imageProgress.value = progress
        },
      }

      return await aiService.generateCompletePersona(options)
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : 'Persona 生成失败'
      throw error
    } finally {
      isGenerating.value = false
    }
  }

  function cancel() {
    controller.value?.abort()
    aiService.cancelAll()
    isGenerating.value = false
  }

  onBeforeUnmount(cancel)

  return {
    isGenerating,
    canCancel,
    streamedText,
    imageProgress,
    errorMessage,
    generateText,
    generateCompletePersona,
    cancel,
  }
}
