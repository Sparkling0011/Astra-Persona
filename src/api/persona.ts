import { http } from '@/api/http'
import { aiService } from '@/services/aiService'
import type { AvatarVariant, PersonaBrand, PersonaForm, PersonaGenerationParams, PersonaSection, PersonaStyle, PlatformBio } from '@/types/persona'
import { createId } from '@/utils/id'

type GeneratePersonaResponse = PersonaBrand

export async function generatePersona(payload: PersonaForm | PersonaGenerationParams): Promise<PersonaBrand> {
  if (!shouldUseRealAI()) {
    return mockPersonaBrand(payload)
  }

  return aiService.generateCompletePersona({ form: payload })
}

export async function regeneratePersonaSection(brand: PersonaBrand, section: PersonaSection): Promise<PersonaBrand> {
  if (!shouldUseRealAI()) {
    return mockRegenerateSection(brand, section)
  }

  return regenerateWithAI(brand, section)
}

export async function generatePersonaByBackend(payload: PersonaForm): Promise<PersonaBrand> {
  return http.post<GeneratePersonaResponse, PersonaForm>('/personas/generate', payload)
}

function mockPersonaBrand(payload: PersonaForm | PersonaGenerationParams): Promise<PersonaBrand> {
  const keywords = extractKeywords(payload.prompt)
  const style = styleCopy[payload.style]
  const now = new Date().toISOString()
  const id = createId('brand')
  const params = createParams(payload)
  const avatars = createAvatars(id, payload.style, payload.prompt, params.imageCount)
  const nickname = createNickname(keywords, payload.style)
  const username = createUsername(keywords, payload.style)
  const bios = createBios(keywords, payload.style)

  return Promise.resolve({
    id,
    prompt: payload.prompt,
    style: payload.style,
    avatars,
    avatarUrl: avatars[0]?.url ?? '',
    avatarUrls: avatars.map((avatar) => avatar.url),
    selectedAvatarId: avatars[0]?.id ?? '',
    nicknames: [nickname, username, `${keywords[0] ?? 'Nova'} Persona`],
    nickname,
    username,
    signature: `${style.signatureLead}${keywords[0] ?? '灵感'}，把个人气质变成可识别的品牌信号。`,
    bio: bios[0]?.content ?? '',
    bios,
    tags: createTags(keywords, payload.style),
    params,
    createdAt: now,
    updatedAt: now,
  })
}

async function regenerateWithAI(brand: PersonaBrand, section: PersonaSection): Promise<PersonaBrand> {
  const updatedAt = new Date().toISOString()

  if (section === 'avatar') {
    const identity = await aiService.generatePersonaTextIdentity({ prompt: brand.prompt, style: brand.style })
    const imagePrompt = await aiService.optimizePrompt(identity.imagePrompt, brand.style)
    const imageUrls = aiService.canGenerateImages()
      ? await aiService.generateImages({ prompt: imagePrompt, count: 3 })
      : createAvatars(createId('avatar_set'), brand.style, imagePrompt, brand.params.imageCount).map((avatar) => avatar.url)
    const avatars = imageUrls.map<AvatarVariant>((url, index) => ({
      id: createId('avatar'),
      url,
      label: ['主视觉', '社交款', '专业款'][index] ?? `变体 ${index + 1}`,
    }))

    return {
      ...brand,
      avatars,
      avatarUrl: avatars[0]?.url ?? '',
      avatarUrls: avatars.map((avatar) => avatar.url),
      selectedAvatarId: avatars[0]?.id ?? '',
      updatedAt,
    }
  }

  const identity = await aiService.generatePersonaTextIdentity({ prompt: brand.prompt, style: brand.style })

  if (section === 'signature') {
    return {
      ...brand,
      signature: identity.signature,
      updatedAt,
    }
  }

  return {
    ...brand,
    bios: identity.bios,
    bio: identity.bio,
    tags: identity.tags,
    updatedAt,
  }
}

function shouldUseRealAI() {
  return import.meta.env.VITE_USE_REAL_AI === 'true'
}

function mockRegenerateSection(brand: PersonaBrand, section: PersonaSection): Promise<PersonaBrand> {
  const keywords = extractKeywords(brand.prompt)
  const updatedAt = new Date().toISOString()

  if (section === 'avatar') {
    const avatars = createAvatars(createId('avatar_set'), brand.style, `${brand.prompt}-${updatedAt}`, brand.params.imageCount)

    return Promise.resolve({
      ...brand,
      avatars,
      avatarUrl: avatars[0]?.url ?? '',
      avatarUrls: avatars.map((avatar) => avatar.url),
      selectedAvatarId: avatars[0]?.id ?? '',
      updatedAt,
    })
  }

  if (section === 'signature') {
    const style = styleCopy[brand.style]

    return Promise.resolve({
      ...brand,
      signature: `${style.signatureLead}${keywords[1] ?? keywords[0] ?? '表达'}，让每次出现都留下清晰记忆点。`,
      updatedAt,
    })
  }

  const bios = createBios([...keywords].reverse(), brand.style)

  return Promise.resolve({
    ...brand,
    bios,
    bio: bios[0]?.content ?? brand.bio,
    updatedAt,
  })
}

function createParams(payload: PersonaForm | PersonaGenerationParams): PersonaGenerationParams {
  return {
    prompt: payload.prompt,
    style: payload.style,
    imageCount: 'imageCount' in payload ? payload.imageCount : 3,
    imageSize: 'imageSize' in payload ? payload.imageSize : '1024x1024',
    creativity: 'creativity' in payload ? payload.creativity : 0.75,
    outputLanguage: 'outputLanguage' in payload ? payload.outputLanguage : 'zh-CN',
  }
}

function extractKeywords(prompt: string) {
  return prompt
    .split(/[,，\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6)
}

function createAvatars(id: string, style: PersonaStyle, prompt: string, count = 3): AvatarVariant[] {
  const collection = avatarCollections[style]

  return Array.from({ length: count }, (_, index) => ['主视觉', '社交款', '专业款', '实验款', '封面款', '备用款'][index] ?? `变体 ${index + 1}`).map((label, index) => {
    const seed = encodeURIComponent(`${style}-${prompt}-${index}-${id}`)

    return {
      id: createId('avatar'),
      label,
      url: `https://api.dicebear.com/9.x/${collection}/svg?seed=${seed}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`,
    }
  })
}

function createNickname(keywords: string[], style: PersonaStyle) {
  const base = keywords[0] ?? 'Nova'
  const suffixMap: Record<PersonaStyle, string> = {
    cyberpunk: '霓虹协议',
    anime: '晴空研究所',
    workplace: '增长顾问',
    professional: '品牌架构师',
    xiaohongshu: '灵感小站',
    minimal: 'Mono Lab',
  }

  return `${base}${suffixMap[style]}`
}

function createUsername(keywords: string[], style: PersonaStyle) {
  const base = (keywords[0] ?? 'persona').toLowerCase().replace(/[^\da-z\u4e00-\u9fa5]/gi, '')
  const styleSlug: Record<PersonaStyle, string> = {
    cyberpunk: 'neon',
    anime: 'anime',
    workplace: 'work',
    professional: 'pro',
    xiaohongshu: 'daily',
    minimal: 'mono',
  }

  return `@${styleSlug[style]}_${base || 'persona'}`
}

function createBios(keywords: string[], style: PersonaStyle): PlatformBio[] {
  const keyLine = keywords.length > 0 ? keywords.join(' / ') : 'AI Persona / 内容表达 / 个人品牌'
  const styleName = styleCopy[style].name

  return [
    {
      platform: '自我介绍',
      content: `${styleName}人设｜围绕 ${keyLine} 持续创作，擅长把审美、经验和工具方法整理成清晰、有辨识度的个人品牌表达。`,
    },
  ]
}

function createTags(keywords: string[], style: PersonaStyle) {
  const baseTags = keywords.length > 0 ? keywords.slice(0, 4) : ['AI', 'Persona', 'Creator']
  return [...baseTags, styleCopy[style].name, '可识别']
}

const avatarCollections: Record<PersonaStyle, string> = {
  cyberpunk: 'bottts-neutral',
  anime: 'adventurer',
  workplace: 'notionists',
  professional: 'initials',
  xiaohongshu: 'lorelei',
  minimal: 'shapes',
}

const styleCopy: Record<PersonaStyle, { name: string; signatureLead: string }> = {
  cyberpunk: {
    name: '赛博朋克',
    signatureLead: '在霓虹噪声里提取',
  },
  anime: {
    name: '日系动漫',
    signatureLead: '用轻盈叙事收集',
  },
  workplace: {
    name: '职场',
    signatureLead: '以高效秩序组织',
  },
  professional: {
    name: '专业',
    signatureLead: '用专家视角校准',
  },
  xiaohongshu: {
    name: '小红书风',
    signatureLead: '把日常经验包装成',
  },
  minimal: {
    name: '极简科技',
    signatureLead: '用干净系统表达',
  },
}
