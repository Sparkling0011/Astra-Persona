import type { PersonaStyle } from '@/types/persona'

export const personaStyles: Array<{ label: string; value: PersonaStyle; hint: string }> = [
  { label: '赛博朋克', value: 'cyberpunk', hint: '霓虹、未来感、强对比' },
  { label: '日系动漫', value: 'anime', hint: '轻盈、治愈、角色感' },
  { label: '职场', value: 'workplace', hint: '可信、清晰、效率感' },
  { label: '专业', value: 'professional', hint: '克制、专家、品牌化' },
  { label: '小红书风', value: 'xiaohongshu', hint: '生活方式、亲和、种草' },
  { label: '极简科技', value: 'minimal', hint: '干净、锐利、留白' },
]
