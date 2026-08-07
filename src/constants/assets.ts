import type { AssetConfigState, AssetType, GenerationContext, PersonaStyle } from '@/types/persona'

export type AssetFieldControl = 'select' | 'multi-select' | 'number' | 'slider' | 'switch' | 'text'

export interface AssetFieldDefinition {
  key: string
  label: string
  control: AssetFieldControl
  advanced?: boolean
  helper?: string
  options?: Array<{ label: string; value: string }>
  min?: number
  max?: number
  step?: number
  suffix?: string
}

export interface AssetDefinition {
  type: AssetType
  label: string
  subtitle: string
  model: '文本' | '图像'
  outputHint: string
  fields: AssetFieldDefinition[]
}

export interface ScenarioPreset {
  id: 'full-brand' | 'job-search' | 'creator' | 'avatar-only'
  label: string
  description: string
  assetTypes: AssetType[]
  style: PersonaStyle
  context: Partial<GenerationContext>
  assetConfigs?: {
    [K in AssetType]?: Partial<AssetConfigState[K]>
  }
}

const toneOptions = [
  { label: '专业', value: 'professional' },
  { label: '亲和', value: 'friendly' },
  { label: '鲜明', value: 'bold' },
]

export const assetRegistry: Record<AssetType, AssetDefinition> = {
  identity: {
    type: 'identity',
    label: '名称与用户名',
    subtitle: '社交昵称、英文名与账号名',
    model: '文本',
    outputHint: '昵称 + 用户名',
    fields: [
      {
        key: 'namingStyle',
        label: '命名倾向',
        control: 'select',
        options: [
          { label: '中文为主', value: 'chinese' },
          { label: '中英结合', value: 'bilingual' },
          { label: '英文为主', value: 'english' },
        ],
      },
      {
        key: 'memorability',
        label: '辨识程度',
        control: 'select',
        helper: '控制名称是在易懂稳妥与鲜明独特之间的倾向。',
        options: [
          { label: '稳妥易懂', value: 'stable' },
          { label: '平衡', value: 'balanced' },
          { label: '鲜明独特', value: 'distinctive' },
        ],
      },
      { key: 'candidateCount', label: '候选数量', control: 'number', min: 2, max: 6, suffix: '组', helper: '模型必须返回的昵称候选数量。' },
      { key: 'allowNumbers', label: '账号名允许数字', control: 'switch', advanced: true },
      { key: 'customInstruction', label: '自定义命名要求', control: 'text', advanced: true },
    ],
  },
  avatar: {
    type: 'avatar',
    label: '头像 / 角色形象',
    subtitle: '主视觉头像与角色识别',
    model: '图像',
    outputHint: '多张头像变体',
    fields: [
      { key: 'imageCount', label: '生成数量', control: 'number', min: 1, max: 6, suffix: '张', helper: '本次图像模型返回的头像变体数量。' },
      {
        key: 'imageSize',
        label: '画面比例',
        control: 'select',
        options: [
          { label: '头像 1:1', value: '1024x1024' },
          { label: '人像 4:5', value: '1024x1280' },
          { label: '竖版 2:3', value: '1024x1536' },
        ],
      },
      {
        key: 'medium',
        label: '视觉媒介',
        control: 'select',
        options: [
          { label: '写实摄影', value: 'photo' },
          { label: '数字插画', value: 'illustration' },
          { label: '日系动漫', value: 'anime' },
          { label: '3D 角色', value: '3d' },
          { label: '扁平设计', value: 'flat' },
        ],
      },
      {
        key: 'framing',
        label: '人物构图',
        control: 'select',
        options: [
          { label: '头像特写', value: 'headshot' },
          { label: '半身肖像', value: 'bust' },
          { label: '上半身场景', value: 'half-body' },
        ],
      },
      {
        key: 'background',
        label: '背景策略',
        control: 'select',
        options: [
          { label: '极简留白', value: 'minimal' },
          { label: '品牌渐变', value: 'gradient' },
          { label: '轻场景', value: 'scene' },
        ],
      },
      {
        key: 'styleStrength',
        label: '视觉风格强度',
        control: 'slider',
        min: 0.1,
        max: 1,
        step: 0.05,
        helper: '数值越高，模型越倾向强化视觉风格。',
      },
      {
        key: 'variety',
        label: '变体差异',
        control: 'select',
        advanced: true,
        helper: '控制多张头像在构图、细节和氛围上的差异程度。',
        options: [
          { label: '相近探索', value: 'subtle' },
          { label: '平衡', value: 'balanced' },
          { label: '明显变化', value: 'diverse' },
        ],
      },
      { key: 'customInstruction', label: '自定义视觉要求', control: 'text', advanced: true },
    ],
  },
  signature: {
    type: 'signature',
    label: '社交签名',
    subtitle: '主页签名、状态栏与简介首句',
    model: '文本',
    outputHint: '1 条短签名',
    fields: [
      {
        key: 'length',
        label: '字数范围',
        control: 'select',
        options: [
          { label: '短句 6-14 字', value: 'short' },
          { label: '标准 15-28 字', value: 'medium' },
          { label: '完整 29-45 字', value: 'long' },
        ],
      },
      { key: 'tone', label: '表达语气', control: 'select', options: toneOptions },
      {
        key: 'structure',
        label: '表达结构',
        control: 'select',
        options: [
          { label: '突出价值', value: 'value' },
          { label: '突出专业', value: 'expertise' },
          { label: '态度主张', value: 'attitude' },
          { label: '综合表达', value: 'hybrid' },
        ],
      },
      { key: 'allowEmoji', label: '允许少量 Emoji', control: 'switch', advanced: true },
      { key: 'customInstruction', label: '自定义签名要求', control: 'text', advanced: true },
    ],
  },
  bio: {
    type: 'bio',
    label: '个人简介',
    subtitle: '统一用于个人主页与作品集',
    model: '文本',
    outputHint: '1 段统一简介',
    fields: [
      {
        key: 'length',
        label: '目标篇幅',
        control: 'select',
        options: [
          { label: '精简 50-80 字', value: 'short' },
          { label: '标准 100-150 字', value: 'medium' },
          { label: '完整 180-260 字', value: 'long' },
        ],
      },
      {
        key: 'voice',
        label: '叙述人称',
        control: 'select',
        options: [
          { label: '第一人称', value: 'first-person' },
          { label: '第三人称', value: 'third-person' },
        ],
      },
      {
        key: 'emphasis',
        label: '重点内容',
        control: 'multi-select',
        options: [
          { label: '身份定位', value: 'identity' },
          { label: '专业能力', value: 'expertise' },
          { label: '提供价值', value: 'value' },
          { label: '经历成果', value: 'proof' },
        ],
      },
      { key: 'includeCta', label: '包含行动引导', control: 'switch', advanced: true },
      { key: 'customInstruction', label: '自定义简介要求', control: 'text', advanced: true },
    ],
  },
  tags: {
    type: 'tags',
    label: '关键词标签',
    subtitle: '内容定位、专业领域与记忆点',
    model: '文本',
    outputHint: '标签组合',
    fields: [
      { key: 'count', label: '标签数量', control: 'number', min: 3, max: 12, suffix: '个', helper: '模型必须返回的关键词标签数量。' },
      {
        key: 'density',
        label: '探索范围',
        control: 'select',
        helper: '聚焦会围绕核心定位，扩展会加入更多相关兴趣与特征。',
        options: [
          { label: '高度聚焦', value: 'focused' },
          { label: '平衡', value: 'balanced' },
          { label: '适度扩展', value: 'broad' },
        ],
      },
      {
        key: 'categories',
        label: '标签构成',
        control: 'multi-select',
        options: [
          { label: '身份定位', value: 'identity' },
          { label: '专业能力', value: 'expertise' },
          { label: '内容主题', value: 'topic' },
          { label: '个性特征', value: 'personality' },
        ],
      },
      {
        key: 'format',
        label: '输出格式',
        control: 'select',
        advanced: true,
        options: [
          { label: '纯文本', value: 'plain' },
          { label: '带 # 标签', value: 'hashtag' },
        ],
      },
      { key: 'customInstruction', label: '自定义标签要求', control: 'text', advanced: true },
    ],
  },
}

export const assetOptions = Object.values(assetRegistry)

export const scenarioPresets: ScenarioPreset[] = [
  {
    id: 'full-brand',
    label: '完整个人品牌',
    description: '名称、视觉与文案完整生成',
    assetTypes: ['identity', 'avatar', 'signature', 'bio', 'tags'],
    style: 'professional',
    context: { goal: 'personal-brand', brandVoice: ['professional', 'warm'] },
    assetConfigs: {
      avatar: { medium: 'illustration', framing: 'headshot', styleStrength: 0.65, variety: 'balanced' },
      signature: { tone: 'professional', structure: 'value' },
      bio: { emphasis: ['identity', 'expertise', 'value'] },
      tags: { density: 'focused', categories: ['identity', 'expertise', 'topic'] },
    },
  },
  {
    id: 'job-search',
    label: '求职主页',
    description: '突出专业能力与可信度',
    assetTypes: ['identity', 'avatar', 'signature', 'bio'],
    style: 'workplace',
    context: { goal: 'job-search', audience: '招聘方与行业负责人', brandVoice: ['professional', 'restrained'] },
    assetConfigs: {
      avatar: { medium: 'photo', framing: 'bust', background: 'minimal', styleStrength: 0.35 },
      signature: { tone: 'professional', structure: 'expertise' },
      bio: { emphasis: ['identity', 'expertise', 'proof'] },
    },
  },
  {
    id: 'creator',
    label: '内容创作者',
    description: '强化记忆点与内容定位',
    assetTypes: ['identity', 'avatar', 'bio', 'tags'],
    style: 'xiaohongshu',
    context: { goal: 'creator', audience: '内容受众与潜在合作品牌', brandVoice: ['friendly', 'bold'] },
    assetConfigs: {
      identity: { memorability: 'distinctive' },
      avatar: { medium: 'illustration', framing: 'headshot', background: 'scene', styleStrength: 0.85, variety: 'diverse' },
      bio: { emphasis: ['identity', 'value'] },
      tags: { density: 'broad', categories: ['identity', 'topic', 'personality'] },
    },
  },
  {
    id: 'avatar-only',
    label: '快速头像',
    description: '只生成视觉形象',
    assetTypes: ['avatar'],
    style: 'minimal',
    context: { goal: 'personal-brand' },
    assetConfigs: {
      avatar: { imageCount: 4, medium: 'illustration', framing: 'headshot', background: 'gradient', styleStrength: 0.75 },
    },
  },
]

export function createDefaultGenerationContext(): GenerationContext {
  return {
    goal: 'personal-brand',
    audience: '关注个人品牌与专业内容的用户',
    brandVoice: ['professional', 'warm'],
    language: 'zh-CN',
    requiredKeywords: '',
    excludedKeywords: '',
  }
}

export function createDefaultAssetConfigs(): AssetConfigState {
  return {
    identity: {
      namingStyle: 'bilingual',
      memorability: 'balanced',
      candidateCount: 3,
      allowNumbers: false,
      customInstruction: '',
    },
    avatar: {
      imageCount: 3,
      imageSize: '1024x1024',
      background: 'gradient',
      framing: 'headshot',
      medium: 'illustration',
      styleStrength: 0.7,
      variety: 'balanced',
      customInstruction: '',
    },
    signature: {
      length: 'short',
      tone: 'professional',
      structure: 'value',
      allowEmoji: false,
      customInstruction: '',
    },
    bio: {
      length: 'medium',
      voice: 'first-person',
      emphasis: ['identity', 'expertise', 'value'],
      includeCta: false,
      customInstruction: '',
    },
    tags: {
      count: 6,
      density: 'focused',
      format: 'plain',
      categories: ['identity', 'expertise', 'topic'],
      customInstruction: '',
    },
  }
}
