import { createDefaultAssetConfigs, createDefaultGenerationContext } from '@/constants/assets'
import { aiService } from '@/services/aiService'
import type { PersonaBrand, PersonaForm, PersonaGenerationParams, PersonaSection } from '@/types/persona'

export function generatePersona(payload: PersonaForm | PersonaGenerationParams, signal?: AbortSignal): Promise<PersonaBrand> {
  // AIService owns both the remote provider path and the deterministic local fallback.
  return aiService.generateCompletePersona(signal ? { form: payload, signal } : { form: payload })
}

export async function regeneratePersonaSection(brand: PersonaBrand, section: PersonaSection, signal?: AbortSignal): Promise<PersonaBrand> {
  const params: PersonaGenerationParams = {
    ...brand.params,
    prompt: brand.prompt,
    style: brand.style,
    assetTypes: [section],
    assetConfigs: brand.assetConfigs ?? brand.params.assetConfigs ?? createDefaultAssetConfigs(),
    generationContext: brand.generationContext ?? brand.params.generationContext ?? createDefaultGenerationContext(),
  }
  const generated = await aiService.generateCompletePersona(signal ? { form: params, signal } : { form: params })
  const updatedAt = new Date().toISOString()

  if (section === 'identity') {
    return {
      ...brand,
      nickname: generated.nickname,
      nicknames: generated.nicknames,
      username: generated.username,
      updatedAt,
    }
  }

  if (section === 'avatar') {
    return {
      ...brand,
      avatars: generated.avatars,
      avatarUrl: generated.avatarUrl,
      avatarUrls: generated.avatarUrls,
      selectedAvatarId: generated.selectedAvatarId,
      updatedAt,
    }
  }

  if (section === 'signature') {
    return {
      ...brand,
      signature: generated.signature,
      updatedAt,
    }
  }

  if (section === 'bio') {
    return {
      ...brand,
      bio: generated.bio,
      bios: generated.bios,
      updatedAt,
    }
  }

  return {
    ...brand,
    tags: generated.tags,
    updatedAt,
  }
}
