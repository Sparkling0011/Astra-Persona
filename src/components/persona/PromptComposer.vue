<script setup lang="ts">
import { Check, ChevronDown, ChevronRight, FileText, History, ImageIcon, PenLine, RotateCcw, Tags, UserRound, X } from '@lucide/vue'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

import BaseButton from '@/components/ui/BaseButton.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import BaseTextarea from '@/components/ui/BaseTextarea.vue'
import { assetOptions, scenarioPresets } from '@/constants/assets'
import { personaStyles } from '@/constants/persona'
import { usePersonaStore } from '@/stores/persona'
import type { AssetType } from '@/types/persona'

defineProps<{
  active: boolean
}>()

const emit = defineEmits<{
  focusPanel: []
  next: []
}>()

const personaStore = usePersonaStore()
const { form, promptHistory, selectedAssetTypes } = storeToRefs(personaStore)

const showRecentPrompts = ref(false)
const canContinue = computed(() => form.value.prompt.trim().length > 0 && selectedAssetTypes.value.length > 0)
const generationSummary = computed(() => selectedAssetTypes.value.map((type) => assetOptions.find((asset) => asset.type === type)?.label).filter(Boolean).join('、'))
const activePresetId = computed(() => {
  const selected = selectedAssetTypes.value
  return scenarioPresets.find((preset) => preset.assetTypes.length === selected.length && preset.assetTypes.every((type) => selected.includes(type)))?.id
})

const assetIcons = {
  identity: UserRound,
  avatar: ImageIcon,
  signature: PenLine,
  bio: FileText,
  tags: Tags,
} satisfies Record<AssetType, unknown>

const assetToneClasses: Record<AssetType, string> = {
  identity: 'border-indigo-400/25 bg-indigo-400/10 text-indigo-300',
  avatar: 'border-teal-400/25 bg-teal-400/10 text-teal-300',
  signature: 'border-amber-400/25 bg-amber-400/10 text-amber-300',
  bio: 'border-sky-400/25 bg-sky-400/10 text-sky-300',
  tags: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300',
}

function reusePrompt(prompt: string) {
  personaStore.setPrompt(prompt)
}

function applyPreset(presetId: string) {
  personaStore.applyScenarioPreset(presetId)
  emit('focusPanel')
}
</script>

<template>
  <section
    class="workspace-panel grid gap-4 p-4"
    :class="{ 'workspace-panel-active': active }"
    @click="emit('focusPanel')"
    @focusin="emit('focusPanel')"
  >
    <div class="relative z-10 flex items-start justify-between gap-4">
      <div class="flex min-w-0 items-start gap-3">
        <span class="workspace-step">01</span>
        <div class="min-w-0">
          <p class="text-xs font-medium tracking-[0.18em] text-primary">生成内容</p>
          <h1 class="mt-2 whitespace-nowrap text-2xl font-semibold tracking-normal text-card-foreground">选择生成内容</h1>
          <p class="mt-2 text-sm leading-6 text-muted-foreground">输入定位，并决定本次要生成哪些内容。</p>
        </div>
      </div>
      <button type="button" class="icon-button" title="恢复默认设置" aria-label="恢复默认设置" @click="personaStore.resetForm">
        <RotateCcw class="size-4" />
      </button>
    </div>

    <BaseTextarea
      id="brand-prompt"
      v-model="form.prompt"
      class="relative z-10"
      label="品牌简述（写具体的人和事）"
      placeholder="例如：独立 AI 产品顾问，为小团队设计工作流；做过哪些项目、相信什么、希望谁记住你。"
    />

    <BaseSelect id="brand-style" v-model="form.style" class="relative z-10" label="表达风格" :options="personaStyles" />

    <div class="relative z-10 grid gap-3 rounded-lg border border-white/10 bg-background/35 p-3">
      <div class="flex items-center justify-between gap-3">
        <span class="text-sm font-medium text-foreground">快速场景</span>
        <span class="text-xs text-muted-foreground">一键配置</span>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <button
          v-for="preset in scenarioPresets"
          :key="preset.id"
          type="button"
          class="rounded-lg border p-2.5 text-left transition duration-200 hover:-translate-y-0.5"
          :class="activePresetId === preset.id ? 'border-primary/50 bg-primary/10' : 'border-white/10 bg-card/35 hover:border-primary/25 hover:bg-card/60'"
          @click="applyPreset(preset.id)"
        >
          <span class="block text-xs font-medium text-foreground">{{ preset.label }}</span>
          <span class="mt-1 block text-[11px] leading-4 text-muted-foreground">{{ preset.description }}</span>
        </button>
      </div>
    </div>

    <div class="relative z-10 grid gap-3 rounded-lg border border-white/10 bg-background/35 p-3">
      <div class="flex items-center justify-between">
        <span class="text-sm font-medium text-foreground">选择内容</span>
        <span class="text-xs text-muted-foreground">{{ selectedAssetTypes.length }} 项</span>
      </div>
      <div class="grid gap-2">
        <button
          v-for="asset in assetOptions"
          :key="asset.type"
          type="button"
          class="group grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border p-3 text-left transition duration-200 hover:-translate-y-0.5"
          :class="
            selectedAssetTypes.includes(asset.type)
              ? 'border-primary/55 bg-[linear-gradient(135deg,hsl(var(--primary)/0.16),hsl(var(--card)/0.6))] shadow-[0_0_34px_-22px_rgb(20_184_166/0.95)]'
              : 'border-white/10 bg-card/45 opacity-85 hover:border-primary/25 hover:opacity-100'
          "
          @click="personaStore.toggleAssetType(asset.type); emit('focusPanel')"
        >
          <span class="grid size-9 place-items-center rounded-md border" :class="assetToneClasses[asset.type]">
            <component :is="assetIcons[asset.type]" class="size-4" />
          </span>
          <span class="min-w-0">
            <span class="block text-sm font-medium text-foreground">{{ asset.label }}</span>
            <span class="mt-1 block truncate text-xs text-muted-foreground">{{ asset.subtitle }}</span>
          </span>
          <span class="grid justify-items-end gap-1">
            <span class="grid size-6 place-items-center rounded-full border text-xs" :class="selectedAssetTypes.includes(asset.type) ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground'">
              <Check v-if="selectedAssetTypes.includes(asset.type)" class="size-3.5" />
            </span>
          </span>
        </button>
      </div>
    </div>

    <div v-if="promptHistory.length" class="relative z-10 rounded-lg border border-white/10 bg-background/35 p-3">
      <div class="flex items-center justify-between gap-3">
        <button type="button" class="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-medium text-foreground" @click="showRecentPrompts = !showRecentPrompts">
          <History class="size-4 text-muted-foreground" />
          最近使用的简述
          <ChevronDown class="ml-auto size-4 text-muted-foreground transition" :class="{ 'rotate-180': showRecentPrompts }" />
        </button>
        <button class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" @click="personaStore.clearPromptHistory">
          <X class="size-3.5" />
          清空
        </button>
      </div>
      <div v-if="showRecentPrompts" class="mt-3 flex flex-wrap gap-2">
        <button
          v-for="item in promptHistory.slice(0, 5)"
          :key="item.id"
          class="max-w-full truncate rounded-md border border-border bg-card px-2.5 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          @click="reusePrompt(item.prompt)"
        >
          {{ item.prompt }}
        </button>
      </div>
    </div>

    <div class="relative z-10 flex items-center justify-between gap-3 rounded-lg border border-primary/15 bg-primary/[0.055] px-3 py-2.5">
      <div class="min-w-0">
        <p class="text-xs font-medium text-primary">已选择 {{ selectedAssetTypes.length }} 项内容</p>
        <p class="mt-1 truncate text-[11px] text-muted-foreground" :title="generationSummary">{{ generationSummary }}</p>
      </div>
      <BaseButton class="shrink-0 xl:hidden" :disabled="!canContinue" @click="emit('next')">
        配置参数
        <ChevronRight class="size-4" />
      </BaseButton>
    </div>
  </section>
</template>
