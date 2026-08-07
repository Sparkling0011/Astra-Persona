<script setup lang="ts">
import { Loader2, WandSparkles, X } from '@lucide/vue'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

import BaseButton from '@/components/ui/BaseButton.vue'
import { assetRegistry } from '@/constants/assets'
import { usePersonaStore } from '@/stores/persona'

const personaStore = usePersonaStore()
const { form, isGenerating, selectedAssetTypes } = storeToRefs(personaStore)

const canGenerate = computed(
  () => form.value.prompt.trim().length > 0 && selectedAssetTypes.value.length > 0 && !isGenerating.value,
)
const selectedLabels = computed(() =>
  selectedAssetTypes.value.map((type) => assetRegistry[type].label).join('、'),
)
const requestProfile = computed(() => {
  const includesImage = selectedAssetTypes.value.includes('avatar')
  return includesImage ? '文本 + 图像模型' : '文本模型'
})
const validationHint = computed(() => {
  if (!form.value.prompt.trim()) {
    return '请先填写品牌简述'
  }

  if (!selectedAssetTypes.value.length) {
    return '请至少选择一种生成内容'
  }

  return `将生成 ${selectedAssetTypes.value.length} 项内容`
})
</script>

<template>
  <div class="generation-action-bar">
    <div class="min-w-0">
      <div class="flex items-center gap-2 text-sm font-semibold text-foreground">
        <span class="size-2 rounded-full" :class="canGenerate ? 'bg-primary shadow-[0_0_12px_hsl(var(--primary)/0.7)]' : 'bg-muted-foreground/40'" />
        {{ validationHint }}
      </div>
      <p class="mt-1 truncate text-xs text-muted-foreground" :title="selectedLabels">
        {{ requestProfile }}<template v-if="selectedLabels"> · {{ selectedLabels }}</template>
      </p>
    </div>

    <BaseButton v-if="!isGenerating" class="shrink-0" :disabled="!canGenerate" @click="personaStore.createPersona">
      <WandSparkles class="size-4" />
      生成 {{ selectedAssetTypes.length }} 项内容
    </BaseButton>
    <BaseButton v-else class="shrink-0" variant="secondary" @click="personaStore.cancelGeneration">
      <Loader2 class="size-4 animate-spin" />
      <span class="hidden sm:inline">生成中</span>
      <X class="size-4" />
      取消
    </BaseButton>
  </div>
</template>
