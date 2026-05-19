export type PersonaStyle = 'cyberpunk' | 'anime' | 'workplace' | 'professional' | 'xiaohongshu' | 'minimal'

export type PersonaSection = 'avatar' | 'signature' | 'bio'

export interface PersonaForm {
  prompt: string
  style: PersonaStyle
}

export interface PersonaGenerationParams extends PersonaForm {
  imageCount: number
  imageSize: string
  creativity: number
  outputLanguage: 'zh-CN' | 'en-US'
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
