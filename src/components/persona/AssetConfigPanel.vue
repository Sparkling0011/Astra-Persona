<script setup lang="ts">
import { ChevronDown, CircleHelp, FileText, ImageIcon, PenLine, SlidersHorizontal, Tags, UserRound } from '@lucide/vue'
import { NAlert, NInput, NInputNumber, NSelect, NSlider, NSwitch, NTooltip } from 'naive-ui'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'

import GenerationActionBar from '@/components/persona/GenerationActionBar.vue'
import { assetRegistry, type AssetFieldDefinition } from '@/constants/assets'
import { usePersonaStore } from '@/stores/persona'
import type { AssetType } from '@/types/persona'

defineProps<{
  active: boolean
}>()

const emit = defineEmits<{
  focusPanel: []
}>()

const personaStore = usePersonaStore()
const { activeBrand, assetConfigs, errorMessage, generationContext, selectedAssetTypes } = storeToRefs(personaStore)
const activeAssetType = ref<AssetType | null>(null)
const expandedAdvanced = ref<AssetType[]>([])
const showContextPanel = ref(false)
const showContextAdvanced = ref(false)

const selectedAssets = computed(() => selectedAssetTypes.value.map((type) => assetRegistry[type]))

const assetIcons = {
  identity: UserRound,
  avatar: ImageIcon,
  signature: PenLine,
  bio: FileText,
  tags: Tags,
} satisfies Record<AssetType, unknown>

const goalOptions = [
  { label: '打造个人品牌', value: 'personal-brand' },
  { label: '求职与职业展示', value: 'job-search' },
  { label: '内容创作', value: 'creator' },
  { label: '自由职业获客', value: 'freelance' },
  { label: '创始人形象', value: 'founder' },
]

const voiceOptions = [
  { label: '专业', value: 'professional' },
  { label: '亲和', value: 'friendly' },
  { label: '克制', value: 'restrained' },
  { label: '鲜明', value: 'bold' },
  { label: '温暖', value: 'warm' },
  { label: '幽默', value: 'witty' },
]

const languageOptions = [
  { label: '简体中文', value: 'zh-CN' },
  { label: '英文', value: 'en-US' },
  { label: '中英结合', value: 'bilingual' },
]

const contextSummary = computed(() => {
  const goal = goalOptions.find((item) => item.value === generationContext.value.goal)?.label
  const language = languageOptions.find((item) => item.value === generationContext.value.language)?.label
  const voices = generationContext.value.brandVoice
    .map((value) => voiceOptions.find((item) => item.value === value)?.label)
    .filter(Boolean)
    .join('、')
  return [goal, language, voices].filter(Boolean).join(' · ')
})

const contextModified = computed(() => {
  if (!activeBrand.value?.generationContext) {
    return false
  }

  return JSON.stringify(generationContext.value) !== JSON.stringify(activeBrand.value.generationContext)
})

watch(
  selectedAssetTypes,
  (types) => {
    if (!activeAssetType.value || !types.includes(activeAssetType.value)) {
      activeAssetType.value = types[0] ?? null
    }
  },
  { immediate: true },
)

function getFieldValue(type: AssetType, key: string) {
  return (assetConfigs.value[type] as unknown as Record<string, unknown>)[key]
}

function getSelectValue(type: AssetType, key: string): string | string[] | null {
  const value = getFieldValue(type, key)
  return typeof value === 'string' || Array.isArray(value) ? value as string | string[] : null
}

function updateField(type: AssetType, field: AssetFieldDefinition, value: unknown) {
  personaStore.updateAssetField(type, field.key, value)
}

function toggleAsset(type: AssetType) {
  activeAssetType.value = activeAssetType.value === type ? null : type
}

function toggleAdvanced(type: AssetType) {
  expandedAdvanced.value = expandedAdvanced.value.includes(type)
    ? expandedAdvanced.value.filter((item) => item !== type)
    : [...expandedAdvanced.value, type]
}

function visibleFields(type: AssetType) {
  const expanded = expandedAdvanced.value.includes(type)
  return assetRegistry[type].fields.filter((field) => !field.advanced || expanded)
}

function updateContext(key: string, value: unknown) {
  personaStore.updateGenerationContext({ [key]: value })
}

function isAssetModified(type: AssetType) {
  const savedConfig = activeBrand.value?.assetConfigs?.[type]
  return Boolean(savedConfig) && JSON.stringify(assetConfigs.value[type]) !== JSON.stringify(savedConfig)
}

function formatFieldValue(type: AssetType, field: AssetFieldDefinition) {
  const value = getFieldValue(type, field.key)

  if (Array.isArray(value)) {
    return value
      .map((item) => field.options?.find((option) => option.value === item)?.label ?? item)
      .slice(0, 2)
      .join('、')
  }

  if (field.options) {
    return field.options.find((option) => option.value === value)?.label ?? String(value)
  }

  if (typeof value === 'boolean') {
    return value ? '开启' : '关闭'
  }

  return `${String(value)}${field.suffix ?? ''}`
}

function assetSummary(type: AssetType) {
  return assetRegistry[type].fields
    .filter((field) => !field.advanced)
    .slice(0, 2)
    .map((field) => formatFieldValue(type, field))
    .join(' · ')
}
</script>

<template>
  <section
    class="workspace-panel subtle-scrollbar grid h-full min-h-[620px] content-start gap-3 overflow-y-auto p-4 xl:min-h-0"
    :class="{ 'workspace-panel-active': active }"
    @click="emit('focusPanel')"
    @focusin="emit('focusPanel')"
  >
    <div class="relative z-10 flex items-start justify-between gap-4">
      <div class="flex min-w-0 items-start gap-3">
        <span class="workspace-step">02</span>
        <div>
          <p class="text-xs font-medium tracking-[0.18em] text-primary">参数配置</p>
          <h1 class="mt-2 whitespace-nowrap text-xl font-semibold tracking-normal text-foreground">生成偏好</h1>
          <p class="mt-2 text-sm leading-6 text-muted-foreground">先定义统一表达，再微调每项内容。</p>
        </div>
      </div>
      <span class="workspace-status">{{ selectedAssets.length }} 项生效</span>
    </div>

    <article class="config-section relative z-10" :class="{ 'config-section-open': showContextPanel }">
      <button type="button" class="flex w-full items-center gap-3 text-left" @click="showContextPanel = !showContextPanel">
        <span class="grid size-9 shrink-0 place-items-center rounded-md border border-primary/20 bg-primary/10 text-primary">
          <SlidersHorizontal class="size-4" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="flex items-center gap-2 text-sm font-semibold text-foreground">
            统一生成方向
            <span v-if="contextModified" class="size-1.5 rounded-full bg-amber-400" title="相较上次生成已修改" />
          </span>
          <span class="mt-1 block truncate text-xs text-muted-foreground">{{ contextSummary }}</span>
        </span>
        <ChevronDown class="size-4 shrink-0 text-muted-foreground transition" :class="{ 'rotate-180': showContextPanel }" />
      </button>

      <div v-if="showContextPanel" class="mt-4 grid gap-3 border-t border-white/10 pt-4">
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="grid gap-2 text-xs font-medium text-muted-foreground">
            <span>使用目标</span>
            <NSelect :value="generationContext.goal" :options="goalOptions" @update:value="updateContext('goal', $event)" />
          </label>
          <label class="grid gap-2 text-xs font-medium text-muted-foreground">
            <span>输出语言</span>
            <NSelect :value="generationContext.language" :options="languageOptions" @update:value="updateContext('language', $event)" />
          </label>
        </div>

        <label class="grid gap-2 text-xs font-medium text-muted-foreground">
          <span>目标受众</span>
          <NInput :value="generationContext.audience" placeholder="例如：招聘方、潜在客户或内容受众" @update:value="updateContext('audience', $event)" />
        </label>

        <label class="grid gap-2 text-xs font-medium text-muted-foreground">
          <span>品牌语气</span>
          <NSelect
            :value="generationContext.brandVoice"
            multiple
            :max-tag-count="3"
            :options="voiceOptions"
            @update:value="updateContext('brandVoice', $event)"
          />
        </label>

        <button type="button" class="flex items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground" @click="showContextAdvanced = !showContextAdvanced">
          <ChevronDown class="size-3.5 transition" :class="{ 'rotate-180': showContextAdvanced }" />
          {{ showContextAdvanced ? '收起真实资料与内容约束' : '补充真实资料与内容约束' }}
        </button>

        <div v-if="showContextAdvanced" class="grid gap-3 sm:grid-cols-2">
          <p class="sm:col-span-2 text-xs leading-5 text-muted-foreground">
            真实经历和本人表达会直接进入生成依据；未提供的事实不会被模型擅自补写。
          </p>
          <label class="grid gap-2 text-xs font-medium text-muted-foreground sm:col-span-2">
            <span>真实经历或代表项目</span>
            <NInput :value="generationContext.experience" type="textarea" :autosize="{ minRows: 2, maxRows: 4 }" placeholder="例如：曾为 3 家 SaaS 团队设计 AI 工作流，长期写效率工具实践复盘。" @update:value="updateContext('experience', $event)" />
          </label>
          <label class="grid gap-2 text-xs font-medium text-muted-foreground">
            <span>可验证成果</span>
            <NInput :value="generationContext.proofPoints" placeholder="例如：作品集、服务对象、项目结果；不确定可留空" @update:value="updateContext('proofPoints', $event)" />
          </label>
          <label class="grid gap-2 text-xs font-medium text-muted-foreground">
            <span>想表达的观点</span>
            <NInput :value="generationContext.perspective" placeholder="例如：好工具应该减少决策疲劳，而不是制造更多功能" @update:value="updateContext('perspective', $event)" />
          </label>
          <label class="grid gap-2 text-xs font-medium text-muted-foreground sm:col-span-2">
            <span>一句本人写过的话</span>
            <NInput :value="generationContext.writingSample" type="textarea" :autosize="{ minRows: 2, maxRows: 4 }" placeholder="粘贴一两句你觉得像自己的表达，模型会参考节奏和用词，不会原样照抄。" @update:value="updateContext('writingSample', $event)" />
          </label>
          <label class="grid gap-2 text-xs font-medium text-muted-foreground">
            <span>必须包含</span>
            <NInput :value="generationContext.requiredKeywords" clearable placeholder="多个关键词用逗号分隔" @update:value="updateContext('requiredKeywords', $event)" />
          </label>
          <label class="grid gap-2 text-xs font-medium text-muted-foreground">
            <span>避免使用</span>
            <NInput :value="generationContext.excludedKeywords" clearable placeholder="不希望出现的表达" @update:value="updateContext('excludedKeywords', $event)" />
          </label>
          <label class="grid gap-2 text-xs font-medium text-muted-foreground sm:col-span-2">
            <span>禁用套话</span>
            <NInput :value="generationContext.avoidPhrases" clearable placeholder="例如：专注于、赋能、让价值被看见（用逗号分隔）" @update:value="updateContext('avoidPhrases', $event)" />
          </label>
        </div>
      </div>
    </article>

    <div v-if="!selectedAssets.length" class="relative z-10 rounded-lg border border-dashed border-border bg-card/45 p-8 text-center text-sm text-muted-foreground">
      请先在左侧选择至少一种生成内容。
    </div>

    <article
      v-for="asset in selectedAssets"
      :key="asset.type"
      class="config-section relative z-10"
      :class="{ 'config-section-open': activeAssetType === asset.type }"
    >
      <button type="button" class="flex w-full items-center gap-3 text-left" @click="toggleAsset(asset.type)">
        <span class="grid size-9 shrink-0 place-items-center rounded-md border border-primary/20 bg-primary/10 text-primary">
          <component :is="assetIcons[asset.type]" class="size-4" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="flex items-center gap-2 text-sm font-semibold text-foreground">
            {{ asset.label }}
            <span v-if="isAssetModified(asset.type)" class="size-1.5 rounded-full bg-amber-400" title="相较上次生成已修改" />
          </span>
          <span class="mt-1 block truncate text-xs text-muted-foreground">{{ assetSummary(asset.type) }}</span>
        </span>
        <span class="hidden rounded-md bg-background/50 px-2 py-1 text-[10px] text-muted-foreground sm:inline">{{ asset.model }}</span>
        <ChevronDown class="size-4 shrink-0 text-muted-foreground transition" :class="{ 'rotate-180': activeAssetType === asset.type }" />
      </button>

      <div v-if="activeAssetType === asset.type" class="mt-4 grid gap-3 border-t border-white/10 pt-4 sm:grid-cols-2">
        <label
          v-for="field in visibleFields(asset.type)"
          :key="field.key"
          class="grid content-start gap-2 text-xs font-medium text-muted-foreground"
          :class="{ 'sm:col-span-2': field.control === 'slider' || field.control === 'text' || field.control === 'multi-select' }"
        >
          <span class="flex items-center justify-between gap-2">
            <span class="flex items-center gap-1.5">
              {{ field.label }}
              <NTooltip v-if="field.helper" trigger="hover">
                <template #trigger>
                  <CircleHelp class="size-3.5 cursor-help text-muted-foreground/70" />
                </template>
                {{ field.helper }}
              </NTooltip>
            </span>
            <span v-if="field.control === 'slider'" class="tabular-nums text-primary">
              {{ Number(getFieldValue(asset.type, field.key)).toFixed(2) }}
            </span>
          </span>

          <NSelect
            v-if="field.control === 'select' || field.control === 'multi-select'"
            :value="getSelectValue(asset.type, field.key)"
            :multiple="field.control === 'multi-select'"
            :options="field.options ?? []"
            @update:value="updateField(asset.type, field, $event)"
          />
          <NInputNumber
            v-else-if="field.control === 'number'"
            :value="Number(getFieldValue(asset.type, field.key))"
            :min="field.min ?? 0"
            :max="field.max ?? 100"
            class="w-full"
            @update:value="updateField(asset.type, field, $event)"
          >
            <template v-if="field.suffix" #suffix>{{ field.suffix }}</template>
          </NInputNumber>
          <NSlider
            v-else-if="field.control === 'slider'"
            :value="Number(getFieldValue(asset.type, field.key))"
            :min="field.min ?? 0"
            :max="field.max ?? 1"
            :step="field.step ?? 0.1"
            @update:value="updateField(asset.type, field, $event)"
          />
          <NSwitch
            v-else-if="field.control === 'switch'"
            :value="Boolean(getFieldValue(asset.type, field.key))"
            @update:value="updateField(asset.type, field, $event)"
          />
          <NInput
            v-else
            :value="String(getFieldValue(asset.type, field.key) ?? '')"
            clearable
            placeholder="输入自定义要求"
            @update:value="updateField(asset.type, field, $event)"
          />
        </label>

        <button
          v-if="asset.fields.some((field) => field.advanced)"
          type="button"
          class="flex items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground sm:col-span-2"
          @click="toggleAdvanced(asset.type)"
        >
          <ChevronDown class="size-3.5 transition" :class="{ 'rotate-180': expandedAdvanced.includes(asset.type) }" />
          {{ expandedAdvanced.includes(asset.type) ? '收起高级设置' : '高级设置' }}
        </button>
      </div>
    </article>

    <NAlert v-if="errorMessage" class="relative z-10" title="生成失败" type="error" :bordered="false" closable @close="personaStore.clearError">
      {{ errorMessage }}
    </NAlert>

    <GenerationActionBar />
  </section>
</template>
