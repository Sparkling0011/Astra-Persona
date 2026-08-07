export type PersonaStyle = 'cyberpunk' | 'anime' | 'workplace' | 'professional' | 'xiaohongshu' | 'minimal'

export type PersonaSection = 'identity' | 'avatar' | 'signature' | 'bio' | 'tags'

export type AssetType = PersonaSection

export interface GenerationContext {
  goal: 'personal-brand' | 'job-search' | 'creator' | 'freelance' | 'founder'
  audience: string
  brandVoice: Array<'professional' | 'friendly' | 'restrained' | 'bold' | 'warm' | 'witty'>
  language: 'zh-CN' | 'en-US' | 'bilingual'
  requiredKeywords: string
  excludedKeywords: string
}

export interface AssetConfigState {
  identity: {
    namingStyle: 'chinese' | 'bilingual' | 'english'
    memorability: 'stable' | 'balanced' | 'distinctive'
    candidateCount: number
    allowNumbers: boolean
    customInstruction: string
  }
  avatar: {
    imageCount: number
    imageSize: string
    background: 'minimal' | 'gradient' | 'scene'
    framing: 'headshot' | 'bust' | 'half-body'
    medium: 'photo' | 'illustration' | 'anime' | '3d' | 'flat'
    styleStrength: number
    variety: 'subtle' | 'balanced' | 'diverse'
    customInstruction: string
  }
  signature: {
    length: 'short' | 'medium' | 'long'
    tone: 'professional' | 'friendly' | 'bold'
    structure: 'value' | 'expertise' | 'attitude' | 'hybrid'
    allowEmoji: boolean
    customInstruction: string
  }
  bio: {
    length: 'short' | 'medium' | 'long'
    voice: 'first-person' | 'third-person'
    emphasis: Array<'identity' | 'expertise' | 'value' | 'proof'>
    includeCta: boolean
    customInstruction: string
  }
  tags: {
    count: number
    density: 'focused' | 'balanced' | 'broad'
    format: 'plain' | 'hashtag'
    categories: Array<'identity' | 'expertise' | 'topic' | 'personality'>
    customInstruction: string
  }
}

export interface PersonaForm {
  prompt: string
  style: PersonaStyle
}

export interface PersonaGenerationParams extends PersonaForm {
  imageCount: number
  imageSize: string
  creativity: number
  outputLanguage: 'zh-CN' | 'en-US'
  assetTypes?: AssetType[]
  assetConfigs?: AssetConfigState
  generationContext?: GenerationContext
}

export interface AvatarVariant {
  id: string
  url: string
  label: string
  editedAt?: string
}

export interface PlatformBio {
  platform: string
  content: string
}

export interface Persona {
  id: string
  prompt: string
  style: PersonaStyle
  avatarUrl: string
  avatarUrls: string[]
  avatars: AvatarVariant[]
  selectedAvatarId: string
  nicknames: string[]
  nickname: string
  username: string
  signature: string
  bio: string
  bios: PlatformBio[]
  tags: string[]
  assetTypes?: AssetType[]
  assetConfigs?: AssetConfigState
  generationContext?: GenerationContext
  params: PersonaGenerationParams
  createdAt: string
  updatedAt: string
}

export type PersonaBrand = Persona

export interface PromptHistoryItem {
  id: string
  prompt: string
  style: PersonaStyle
  createdAt: string
}

export interface PersonaExportKit {
  persona: Persona
  exportedAt: string
  formatVersion: '1.0'
}
